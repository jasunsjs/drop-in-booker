import type { Page } from "playwright";
import { DOW_INDEX, dropinConfig, type EventConfig } from "./config.js";

export function to12Hour(time24: string): string {
    const [hStr, m] = time24.split(':');
    if (hStr && m) {
        const hour = parseInt(hStr, 10);
        const suffix = hour >= 12 ? "pm" : "am";
        const hour12 = hour % 12 === 0 ? 12 : hour % 12;

        return `${hour12}:${m} ${suffix}`;
    }

    throw new Error(`Invalid time format: ${time24}`);
}

export function getTargetDate(eventConfig: EventConfig): Date {
    const today = new Date();
    const target = new Date(today);
    const todayDOW = today.getDay();
    const targetDOW = DOW_INDEX[eventConfig.day]!;
    let diff = targetDOW - todayDOW;
    if (diff < 0) {
        diff += 7; // Calculate number of days ahead 
    }

    if (diff == 1 && !dropinConfig["book-for-tmr"]) {
        diff += 7;
    }

    target.setDate(target.getDate() + diff);
    return target;
}

export async function displayRefreshTimer(page: Page, text: string) {
    await page.evaluate((content) => {
        const id = "register-refresh-timer";
        let el = document.getElementById(id) as HTMLDivElement | null;

        if (!el) {
        el = document.createElement("div");
        el.id = id;

        // Position: centered at top, "hanging" down a bit
        el.style.position = "fixed";
        el.style.top = "20px";
        el.style.left = "50%";
        el.style.transform = "translateX(-50%)";

        // Size & layout
        el.style.padding = "12px 24px";
        el.style.borderRadius = "999px"; // pill shape
        el.style.maxWidth = "80%";
        el.style.textAlign = "center";

        // Visual style
        el.style.background = "rgba(0, 0, 0, 0.8)";
        el.style.color = "white";
        el.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
        el.style.fontSize = "18px";
        el.style.fontWeight = "600";
        el.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.4)";
        el.style.zIndex = "999999";

        // Don't block clicks on the page
        el.style.pointerEvents = "none";

        document.body.appendChild(el);
        }

        el.textContent = content;
    }, text);
}
