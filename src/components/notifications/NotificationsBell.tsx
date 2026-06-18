import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useUserNotifications } from "@/lib/hooks/useUserNotifications";

function relTime(ts: string | null) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function NotificationsBell() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markAllRead } = useUserNotifications();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${unreadCount ? ` (${unreadCount})` : ""}`}
          className="relative h-9 w-9 rounded-md grid place-items-center text-n500 hover:text-n900 hover:bg-n100 dark:text-d-muted dark:hover:text-d-text dark:hover:bg-d-surface-2 transition-colors duration-150"
        >
          <Bell className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-semibold grid place-items-center tabular-nums">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] p-0">
        <div className="px-3 py-2.5 border-b border-n200 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-n900">Notifications</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllRead()}
              className="text-[11px] text-orange-600 hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12.5px] text-n500">
              You're all caught up.
            </div>
          ) : (
            <ul className="divide-y divide-n100">
              {notifications.map((n) => {
                const unread = !n.read_at;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (unread) markRead(n.id);
                        if (n.route) navigate(n.route);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2.5 hover:bg-n50 transition-colors",
                        unread && "bg-orange-50/40",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {unread && <span className="mt-1 h-2 w-2 rounded-full bg-orange-500 shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-n900 truncate">{n.title}</div>
                          <div className="text-[12px] text-n600 line-clamp-2">{n.message}</div>
                          <div className="text-[11px] text-n400 mt-0.5">{relTime(n.created_at)}</div>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
