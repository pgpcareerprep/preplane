import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Lumina toaster — top-right, 360px, rounded-xl, shadow-lg, branded left borders
 * per variant (success/error/warning/info). 4s auto-dismiss, max 3 stacked.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="top-right"
      visibleToasts={3}
      duration={4000}
      closeButton
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast w-[360px] rounded-xl bg-card text-n800 border border-n200 shadow-lg p-4 border-l-[3px] border-l-n400",
          title: "text-[13px] font-semibold text-n900",
          description: "text-[12px] text-n600",
          actionButton: "text-[12px] font-medium text-orange-600 hover:text-orange-500 underline-offset-2",
          cancelButton: "text-[12px] text-n500 hover:text-n800",
          success: "border-l-sage-400 [&_[data-icon]]:text-sage-600",
          error:   "border-l-coral-400 [&_[data-icon]]:text-coral-600",
          warning: "border-l-yellow-500 [&_[data-icon]]:text-yellow-600",
          info:    "border-l-sky-400 [&_[data-icon]]:text-sky-400",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
