import { useState, useEffect } from "react";
import { Share, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export function QuickInstallPrompt() {
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && !(window as any).MSStream;
    const standalone = (window.navigator as any).standalone === true;
    setIsIOS(ios);

    if (ios && !standalone) {
      const dismissed = sessionStorage.getItem("pwa-install-dismissed");
      if (!dismissed) setShow(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      const dismissed = sessionStorage.getItem("pwa-install-dismissed");
      if (!dismissed) {
        setCanInstall(true);
        setShow(true);
      }
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") deferredPrompt = null;
    }
    setShow(false);
  };

  const handleDismiss = () => {
    sessionStorage.setItem("pwa-install-dismissed", "1");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="mx-4 mb-4 rounded-xl border border-border bg-card p-4 shadow-sm flex gap-3 items-start">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">Add PrepLane to Home Screen</p>
        {isIOS ? (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
            Tap <Share className="inline h-3 w-3 shrink-0" /> then "Add to Home Screen"
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">
            Install for offline-ready quick actions
          </p>
        )}
      </div>
      {!isIOS && canInstall && (
        <button
          onClick={handleInstall}
          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          Install
        </button>
      )}
      <button
        onClick={handleDismiss}
        className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
}
