import { toast } from "sonner";

interface ToastAction {
  label: string;
  onClick: () => void;
}

export function toastSuccess(message: string, action?: ToastAction) {
  toast.success(message, action ? { action } : undefined);
}

export function toastError(action: string) {
  toast.error(`Could not ${action}. Try again.`);
}

export function toastPromise<T>(
  promise: Promise<T>,
  messages: { loading: string; success: string; error: string },
) {
  return toast.promise(promise, messages);
}
