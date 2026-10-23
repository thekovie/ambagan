"use client";

import { useEffect, useRef } from "react";

/**
 * After a form action comes back with errors, move focus to the first field marked `aria-invalid`, so keyboard and
 * screen-reader users land on the problem instead of the top of the page (and on a phone, the error is in view).
 * Pass the action's state: a fresh object arrives with every result. Put the returned ref on the `<form>`.
 */
export function useFocusFirstError(state: unknown) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);
  return form;
}
