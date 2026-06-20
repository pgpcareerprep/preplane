import { cn } from "@/lib/utils";

/** Four-segment PrepLane mark (matches app icon). */
export function PrepLaneMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <path d="M0.5 12.5L3.2 2.2C3.5 1.2 4.2 0.5 5.2 0.5H6.3C7.1 0.5 7.5 1 7.2 1.9L4.8 12.5C4.5 13.4 3.8 14 2.8 14H1.7C0.9 14 0.4 13.5 0.5 12.5Z" fill="#E38330" />
      <path d="M9 12.5L11.7 2.2C12 1.2 12.7 0.5 13.7 0.5H14.8C15.6 0.5 16 1 15.7 1.9L13.3 12.5C13 13.4 12.3 14 11.3 14H10.2C9.4 14 8.9 13.5 9 12.5Z" fill="#F08A24" />
      <path d="M17.5 12.5L20.2 2.2C20.5 1.2 21.2 0.5 22.2 0.5H23.3C24.1 0.5 24.5 1 24.2 1.9L21.8 12.5C21.5 13.4 20.8 14 19.8 14H18.7C17.9 14 17.4 13.5 17.5 12.5Z" fill="#F7D344" />
      <path d="M26 12.5L28.7 2.2C29 1.2 29.7 0.5 30.7 0.5H31.8C32.6 0.5 33 1 32.7 1.9L30.3 12.5C30 13.4 29.3 14 28.3 14H27.2C26.4 14 25.9 13.5 26 12.5Z" fill="#C8CDD4" />
    </svg>
  );
}
