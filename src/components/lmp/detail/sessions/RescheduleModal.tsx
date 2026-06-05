import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export function RescheduleModal({
  open, onOpenChange, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (date: Date, time: string, note: string) => void;
}) {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [time, setTime] = useState("15:00");
  const [note, setNote] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-semibold text-n900">Reschedule Session</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <label className="text-[12px] uppercase tracking-[0.5px] text-n500 font-medium mb-1.5 block">Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <button className={cn(
                  "w-full h-10 rounded-md border border-n300 bg-card px-3 text-left text-[13px] flex items-center gap-2 hover:border-n400 focus:outline-none focus:border-orange-400",
                )}>
                  <CalendarIcon className="h-4 w-4 text-n400" />
                  <span className="text-n800">{date ? format(date, "PPP") : "Pick date"}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single" selected={date} onSelect={setDate}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <label className="text-[12px] uppercase tracking-[0.5px] text-n500 font-medium mb-1.5 block">Time</label>
            <input
              type="time" value={time} onChange={(e) => setTime(e.target.value)}
              className="w-full h-10 rounded-md border border-n300 bg-card px-3 text-[13px] text-n800 focus:outline-none focus:border-orange-400"
            />
          </div>

          <div>
            <label className="text-[12px] uppercase tracking-[0.5px] text-n500 font-medium mb-1.5 block">Note (optional)</label>
            <textarea
              value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              placeholder="Reason for reschedule…"
              className="w-full rounded-md border border-n300 bg-card px-3 py-2 text-[13px] text-n800 focus:outline-none focus:border-orange-400 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => date && onConfirm(date, time, note)}
            className="flex-1 h-10 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium transition-colors"
          >
            Confirm Reschedule
          </button>
          <button onClick={() => onOpenChange(false)} className="h-10 px-4 text-[13px] text-n600 hover:text-n800 font-medium">
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}