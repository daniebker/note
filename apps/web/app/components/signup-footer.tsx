import Link from "next/link";

export function SignupFooter() {
  return (
    <footer className="border-t border-edge px-4 py-8 text-center sm:px-6">
      <p className="text-sm text-ink-muted">
        Like taking notes like this?{" "}
        <Link className="font-medium text-accent hover:underline" href="/register">
          Sign up
        </Link>{" "}
        and create your own.
      </p>
    </footer>
  );
}
