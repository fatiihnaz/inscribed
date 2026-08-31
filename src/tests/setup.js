/**
 * @file Suite-wide test setup.
 *
 * Testing Library's async helpers default to a one-second budget, which is
 * plenty for a component and far too little for the ones here that mount the
 * whole provider stack and wait on two mocked round-trips: under a full
 * parallel run those legitimately take longer than a second, and the failure
 * reads as "the row never rendered" rather than "the machine was busy".
 *
 * The suite's own timeout still bounds a genuinely hung test; this only stops
 * the async helpers from giving up before it does.
 */

// Node-environment files (the transport and payload contracts) never touch the
// DOM, and importing the React helpers there would pull react-dom in for
// nothing.
if (typeof window !== "undefined") {
  const { configure } = await import("@testing-library/dom");
  configure({ asyncUtilTimeout: 5000 });
}
