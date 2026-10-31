import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/components/ui/Toast";
import { authService } from "@/services/authService";
import type { ApiError } from "@/services/api";
import type { MessageResponse } from "@/types/auth";

/** "Didn't get it? Send again" — for the email confirmation link. */
export function ResendVerification({ email }: { email: string }) {
  const toast = useToast();
  const mutation = useMutation<MessageResponse, ApiError>({
    mutationFn: () => authService.resendVerification(email),
    onSuccess: ({ message }) => toast.success(message),
    onError: (error) => toast.error(error.message),
  });

  return (
    <p className="text-sm text-muted">
      Didn't get the email? Check spam, or{" "}
      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !email}
        className="font-semibold text-primary hover:underline disabled:opacity-50"
      >
        {mutation.isPending ? "sending…" : "send it again"}
      </button>
      .
    </p>
  );
}
