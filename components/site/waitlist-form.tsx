"use client"

import { useId, useState } from "react"

import { cn } from "@/lib/utils"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function WaitlistForm({ className }: { className?: string }) {
  const id = useId()
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [joined, setJoined] = useState<string | null>(null)

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const value = email.trim()
    if (!EMAIL_PATTERN.test(value)) {
      setError("Enter a valid email, like name@company.com.")
      return
    }
    // TODO: send `value` to the mailing list backend once it exists.
    setError(null)
    setJoined(value)
  }

  if (joined) {
    return (
      <p
        role="status"
        className={cn("max-w-md text-base text-ice-strong", className)}
      >
        Thanks. We&apos;ll email{" "}
        <span className="font-medium text-white">{joined}</span> when the new
        site goes live.
      </p>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className={cn("w-full max-w-md", className)}
    >
      <label htmlFor={`${id}-email`} className="sr-only">
        Email address
      </label>
      <div
        className={cn(
          "flex rounded-full border bg-ink/70 p-1 backdrop-blur-md transition-colors focus-within:border-ice/70",
          error ? "border-caustic/70" : "border-white/12"
        )}
      >
        <input
          id={`${id}-email`}
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (error) setError(null)
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="min-w-0 flex-1 bg-transparent px-4 text-sm text-white placeholder:text-mist/60 focus:outline-none"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-ice px-5 py-2.5 text-sm font-semibold text-abyss shadow-[0_0_24px_rgba(138,232,252,0.35)] transition-[background-color,box-shadow] hover:bg-ice-strong hover:shadow-[0_0_32px_rgba(138,232,252,0.55)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ice"
        >
          Notify me
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-2 pl-4 text-sm text-caustic">
          {error}
        </p>
      )}
    </form>
  )
}
