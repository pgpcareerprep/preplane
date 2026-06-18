import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/rolesContext";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";

export type UserNotification = {
  id: string;
  title: string;
  message: string;
  category: string;
  severity: string;
  route: string | null;
  entity_type: string;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

export function useUserNotifications() {
  const { user } = useRole();
  const qc = useQueryClient();
  const userId = user?.id;

  useRealtimeInvalidate("user_notifications" as never, [["user-notifications", userId]], {
    enabled: !!userId,
  });

  const query = useQuery({
    queryKey: ["user-notifications", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_notifications")
        .select("id, title, message, category, severity, route, entity_type, entity_id, read_at, created_at")
        .eq("recipient_user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as UserNotification[];
    },
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

  const unreadCount = (query.data ?? []).filter((n) => !n.read_at).length;

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("user_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("recipient_user_id", userId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-notifications", userId] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("user_notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null)
        .eq("recipient_user_id", userId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-notifications", userId] }),
  });

  return {
    notifications: query.data ?? [],
    unreadCount,
    isLoading: query.isLoading,
    markRead: markRead.mutate,
    markAllRead: markAllRead.mutate,
  };
}
