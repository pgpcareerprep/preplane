use crate::config::Config;
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde_json::Value;

const DEFAULT_GEMINI_VOICE: &str = "Aoede";
const TTS_STYLE_PREFIX: &str = "Say the following in a warm, natural, conversational tone, like a friendly colleague speaking casually — natural pacing, brief pauses at commas, no robotic cadence: ";
const TTS_MODELS: [&str; 2] = ["gemini-2.5-pro-preview-tts", "gemini-2.5-flash-preview-tts"];

pub enum TtsOutcome {
    Audio { bytes: Vec<u8>, content_type: &'static str },
    Fallback,
}

pub async fn synthesize(config: &Config, text: &str, voice_id: Option<&str>) -> TtsOutcome {
    let truncated = text.chars().take(600).collect::<String>();
    if truncated.trim().is_empty() {
        return TtsOutcome::Fallback;
    }
    if let Some(bytes) = try_elevenlabs(config, &truncated, voice_id).await {
        return TtsOutcome::Audio {
            bytes,
            content_type: "audio/mpeg",
        };
    }
    if let Some(bytes) = try_gemini(config, &truncated, voice_id).await {
        return TtsOutcome::Audio {
            bytes,
            content_type: "audio/wav",
        };
    }
    TtsOutcome::Fallback
}

async fn try_elevenlabs(config: &Config, text: &str, voice_id: Option<&str>) -> Option<Vec<u8>> {
    let key = config.elevenlabs_api_key.as_ref()?;
    let raw = voice_id.unwrap_or("").trim();
    let voice = if raw.len() >= 8 && raw.len() <= 32 && raw.chars().all(|c| c.is_ascii_alphanumeric()) {
        raw
    } else {
        "21m00Tcm4TlvDq8ikWAM"
    };
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .ok()?;
    let resp = client
        .post(format!(
            "https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_64"
        ))
        .header("xi-api-key", key)
        .json(&serde_json::json!({
            "text": text,
            "model_id": "eleven_flash_v2_5",
            "voice_settings": { "stability": 0.45, "similarity_boost": 0.75 },
        }))
        .send()
        .await
        .ok()?;
    if resp.status().is_success() {
        resp.bytes().await.ok().map(|b| b.to_vec())
    } else {
        None
    }
}

async fn try_gemini(config: &Config, text: &str, voice_id: Option<&str>) -> Option<Vec<u8>> {
    let key = config.gemini_api_key.as_ref()?;
    let requested = voice_id.unwrap_or("").trim();
    let voice_name = if requested.len() >= 2
        && requested.len() <= 24
        && requested.chars().all(|c| c.is_ascii_alphabetic())
    {
        requested
    } else {
        DEFAULT_GEMINI_VOICE
    };
    let prompt = format!("{TTS_STYLE_PREFIX}{text}");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .ok()?;
    for model in TTS_MODELS {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
        );
        let resp = client
            .post(&url)
            .json(&serde_json::json!({
                "contents": [{ "parts": [{ "text": prompt }] }],
                "generationConfig": {
                    "responseModalities": ["AUDIO"],
                    "speechConfig": {
                        "voiceConfig": { "prebuiltVoiceConfig": { "voiceName": voice_name } }
                    }
                }
            }))
            .send()
            .await;
        let Ok(resp) = resp else { continue };
        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            if status == 404 || status == 429 {
                continue;
            }
            break;
        }
        let data: Value = resp.json().await.ok()?;
        let audio_b64 = data
            .pointer("/candidates/0/content/parts/0/inlineData/data")
            .and_then(Value::as_str)?;
        let pcm = B64.decode(audio_b64).ok()?;
        return Some(pcm_to_wav(&pcm));
    }
    None
}

pub fn pcm_to_wav(pcm_bytes: &[u8]) -> Vec<u8> {
    let sample_rate: u32 = 24000;
    let num_channels: u16 = 1;
    let bits_per_sample: u16 = 16;
    let byte_rate = sample_rate * num_channels as u32 * bits_per_sample as u32 / 8;
    let block_align = num_channels * bits_per_sample / 8;
    let data_size = pcm_bytes.len() as u32;
    let mut buf = Vec::with_capacity(44 + pcm_bytes.len());
    buf.extend_from_slice(b"RIFF");
    buf.extend_from_slice(&(36 + data_size).to_le_bytes());
    buf.extend_from_slice(b"WAVE");
    buf.extend_from_slice(b"fmt ");
    buf.extend_from_slice(&16u32.to_le_bytes());
    buf.extend_from_slice(&1u16.to_le_bytes());
    buf.extend_from_slice(&num_channels.to_le_bytes());
    buf.extend_from_slice(&sample_rate.to_le_bytes());
    buf.extend_from_slice(&byte_rate.to_le_bytes());
    buf.extend_from_slice(&block_align.to_le_bytes());
    buf.extend_from_slice(&bits_per_sample.to_le_bytes());
    buf.extend_from_slice(b"data");
    buf.extend_from_slice(&data_size.to_le_bytes());
    buf.extend_from_slice(pcm_bytes);
    buf
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wav_has_riff_header() {
        let wav = pcm_to_wav(&[0u8; 4]);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
    }
}
