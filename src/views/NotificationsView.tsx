"use client";

import { useEffect, useState } from "react";
import { useNav } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, timeAgo } from "@/lib/client-api";
import { Loader2, Bell, Check } from "lucide-react";

import { toast } from "sonner";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared/page-components";
type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export function NotificationsView() {
  const { navigate } = useNav();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get<{ notifications: Notification[] }>("/api/notifications?limit=100").then((r) => setItems(r.notifications)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const markRead = async (id: string) => {
    try {
      await api.post(`/api/notifications/${id}/read`);
      toast.success("Notification marked as read", { description: "Removed from your unread list." });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (loading) {
    return <LoadingState label="Loading notifications…" />;
  }

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="Notifications"
        description="Recent activity across your account."
        icon={Bell}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="You're all caught up. New activity will appear here."
        />
      ) : (
        <Card className="premium-card">
          <CardContent className="p-0">
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id} className="p-3 flex items-start gap-3">
                  <div className={`h-2 w-2 rounded-full mt-2 shrink-0 ${n.readAt ? "bg-transparent" : "bg-primary"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{n.title}</span>
                      <Badge variant="outline" className="text-[10px] badge-info">{n.type}</Badge>
                      {!n.readAt && <Badge variant="secondary" className="text-[10px] badge-warning">new</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{n.body}</p>
                    <div className="text-xs text-muted-foreground mt-1">{timeAgo(n.createdAt)}</div>
                  </div>
                  {!n.readAt && (
                    <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
