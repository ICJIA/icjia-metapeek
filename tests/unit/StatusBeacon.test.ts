/**
 * @fileoverview Tests for StatusBeacon.vue — the little green/red dot on the
 * header's Status link. Pure presentational: `ok` arrives as a prop
 * (true = healthy, false = degraded/unreachable, null = not known yet), the
 * page owns the fetch. The color must never be the only signal — the state
 * is also spelled out for assistive tech.
 */

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import StatusBeacon from "~/components/StatusBeacon.vue";

describe("StatusBeacon", () => {
  it("shows a green dot and says so when the service is healthy", () => {
    const wrapper = mount(StatusBeacon, { props: { ok: true } });
    const dot = wrapper.get("[data-test='status-beacon-dot']");
    expect(dot.classes().join(" ")).toContain("emerald");
    expect(wrapper.text().toLowerCase()).toContain("all systems normal");
  });

  it("shows a red dot and says so when the service is degraded", () => {
    const wrapper = mount(StatusBeacon, { props: { ok: false } });
    const dot = wrapper.get("[data-test='status-beacon-dot']");
    expect(dot.classes().join(" ")).toContain("red");
    expect(wrapper.text().toLowerCase()).toContain("degraded");
  });

  it("shows no colored verdict while the state is unknown", () => {
    const wrapper = mount(StatusBeacon, { props: { ok: null } });
    const dot = wrapper.get("[data-test='status-beacon-dot']");
    const classes = dot.classes().join(" ");
    expect(classes).not.toContain("emerald");
    expect(classes).not.toContain("red");
    expect(wrapper.text().toLowerCase()).toContain("status");
  });

  it("keeps the dot itself decorative — the words carry the meaning", () => {
    const wrapper = mount(StatusBeacon, { props: { ok: true } });
    expect(
      wrapper.get("[data-test='status-beacon-dot']").attributes("aria-hidden"),
    ).toBe("true");
    // The verdict text is present for screen readers even though the dot is
    // the visible cue.
    expect(wrapper.find(".sr-only").exists()).toBe(true);
  });
});
