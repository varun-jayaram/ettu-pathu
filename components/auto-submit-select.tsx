'use client'

/**
 * A <select> that submits its form the moment it changes.
 *
 * Planning a week is fourteen picks; a Save button beside each would double
 * the taps. The surrounding <form action={serverAction}> still does the work,
 * so this is the only client JS a meal slot needs.
 *
 * `skipEmpty` leaves a blank choice unsubmitted — for a "Something else…"
 * prompt option that is a label, not a value.
 */
export function AutoSubmitSelect({
  skipEmpty = false,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { skipEmpty?: boolean }) {
  return (
    <select
      {...props}
      onChange={(event) => {
        if (skipEmpty && event.currentTarget.value === '') return
        event.currentTarget.form?.requestSubmit()
      }}
    />
  )
}
