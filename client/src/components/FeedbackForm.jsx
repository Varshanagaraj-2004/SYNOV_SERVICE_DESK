import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { submitFeedback } from "../api/tickets";

const inputClass =
  "w-full px-3 py-2 border border-surface-border rounded-lg text-sm focus:outline-none";

export default function FeedbackForm({ ticketId, onSuccess, submitLabel = "Submit feedback" }) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState("");
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");

  const ratingLabels = {
    1: "Very dissatisfied",
    2: "Dissatisfied",
    3: "Neutral",
    4: "Satisfied",
    5: "Very satisfied",
  };

  const feedbackMutation = useMutation({
    mutationFn: (feedback) => submitFeedback(ticketId, feedback),
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      setRating("");
      setComment("");
      setError("");
      onSuccess?.(ticket);
    },
    onError: () => setError("Couldn't submit feedback. Please try again."),
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!rating) {
      setError("Please select a rating before submitting.");
      return;
    }
    setError("");
    feedbackMutation.mutate({ rating: Number(rating), comment });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-status-critical">{error}</p>}
      <div>
        <label className="text-xs font-medium text-text-secondary">
          How satisfied were you with the support you received?
        </label>
        <div className="mt-2 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((value) => {
            const activeRating = hoveredRating || Number(rating);
            const isActive = value <= activeRating;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setRating(String(value))}
                onMouseEnter={() => setHoveredRating(value)}
                onMouseLeave={() => setHoveredRating(0)}
                aria-label={`${value} - ${ratingLabels[value]}`}
                className="rounded-md p-1 text-brand-purple hover:bg-brand-purple/10"
              >
                <Star
                  size={24}
                  className={isActive ? "text-brand-purple" : "text-surface-border"}
                  fill={isActive ? "currentColor" : "none"}
                />
              </button>
            );
          })}
          <span className="ml-2 text-sm text-text-secondary">
            {rating ? ratingLabels[Number(rating)] : "Select a rating"}
          </span>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-text-secondary">
          What could we have done better?
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className={`${inputClass} mt-1`}
          placeholder="Optional comments"
        />
      </div>
      <button
        type="submit"
        disabled={feedbackMutation.isPending}
        className="bg-brand-purple text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {feedbackMutation.isPending ? "Submitting..." : submitLabel}
      </button>
    </form>
  );
}