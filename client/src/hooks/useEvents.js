import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createSseToken } from "../api/auth";
import { useAuth } from "../context/useAuth";

export default function useEvents() {
  const queryClient = useQueryClient();
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return undefined;

    let source;
    let fallbackTimer;
    let stopped = false;

    function invalidateEvent(eventType, payload) {
      if (eventType === "message") {
        queryClient.invalidateQueries({ queryKey: ["recentMessages"] });
        queryClient.invalidateQueries({ queryKey: ["messages", payload.ticketId] });
        return;
      }
      if (eventType === "ticket_updated") {
        queryClient.invalidateQueries({ queryKey: ["tickets"] });
        queryClient.invalidateQueries({ queryKey: ["ticketStats"] });
        queryClient.invalidateQueries({ queryKey: ["ticket", payload.ticketId] });
        queryClient.invalidateQueries({ queryKey: ["ticketActivity", payload.ticketId] });
      }
    }

    function scheduleFallback() {
      if (fallbackTimer) return;
      fallbackTimer = window.setInterval(() => {
        if (document.hidden) return;
        queryClient.invalidateQueries({ queryKey: ["recentMessages"] });
        queryClient.invalidateQueries({ queryKey: ["messages"] });
        queryClient.invalidateQueries({ queryKey: ["tickets"] });
        queryClient.invalidateQueries({ queryKey: ["ticketStats"] });
        connect();
      }, 60_000);
    }

    async function connect() {
      if (stopped || source) return;
      try {
        const { token: streamToken } = await createSseToken();
        if (stopped) return;
        const streamUrl = new URL("/api/events", window.location.origin);
        streamUrl.searchParams.set("token", streamToken);
        source = new EventSource(streamUrl.toString());
        source.addEventListener("open", () => {
          if (fallbackTimer) window.clearInterval(fallbackTimer);
          fallbackTimer = undefined;
        });
        for (const eventType of ["message", "ticket_updated"]) {
          source.addEventListener(eventType, (event) => {
            try {
              invalidateEvent(eventType, JSON.parse(event.data));
            } catch {
              // Ignore malformed event payloads and keep the stream alive.
            }
          });
        }
        source.onerror = () => {
          source?.close();
          source = undefined;
          scheduleFallback();
        };
      } catch {
        scheduleFallback();
      }
    }

    connect();
    return () => {
      stopped = true;
      source?.close();
      if (fallbackTimer) window.clearInterval(fallbackTimer);
    };
  }, [queryClient, token]);
}