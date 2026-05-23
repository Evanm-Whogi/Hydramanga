import { toast } from "react-toastify";

/** Returns false and shows a warning toast when value is empty after trim. */
export function requireTrimmed(value: string, message: string): boolean {
  if (!value.trim()) {
    toast.warning(message);
    return false;
  }
  return true;
}
