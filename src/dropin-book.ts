import { chromium } from "playwright";
import "dotenv/config";
import type { Page, Locator } from "playwright";
import dropinConfig from "../dropin.config.json" with { type: "json" };
import events from "../dropin-events.json" with { type: "json" };

const CONFIG = {
    baseUrl: "https://townofoakville.perfectmind.com/",
    loggedInUrl: /\/MyProfile\/Contact(?:\/|$)/,
    timeout: 8000,
    headless: false,
    refreshInterval: 3000,
    registerWaitTimeout: 10 * 60 * 1000, // 10 mins
};

const PROFILE = {
    username: process.env[`${dropinConfig.name.replace(/\s+/g, "_").toUpperCase()}_USERNAME`]!,
    password: process.env[`${dropinConfig.name.replace(/\s+/g, "_").toUpperCase()}_PASSWORD`]!,
}

const DOW_INDEX: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
} as const;

type EventConfig = {
    name: string;
    sport: string;
    location: string;
    day: string; // Day of the week
    time: string; // "HH:MM" 24h
};

type DropinConfig = {
    name: string;
    "event-name": string;
    "book-for-tmr": boolean;
};

function to12Hour(time24: string): string {
    const [hStr, m] = time24.split(':');
    if (hStr && m) {
        const hour = parseInt(hStr, 10);
        const suffix = hour >= 12 ? "pm" : "am";
        const hour12 = hour % 12 === 0 ? 12 : hour % 12;

        return `${hour12}:${m} ${suffix}`;
    }

    throw new Error(`Invalid time format: ${time24}`);
}

function getTargetDate(eventConfig: EventConfig): Date {
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

async function displayRefreshTimer(page: Page, text: string) {
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

async function findTargetRow(allRows: Locator, targetDateHeader: string, eventConfig: EventConfig): Promise<Locator> {
    const numRows = await allRows.count();
    let targetDateIndex = -1;
    for (let i = 0; i < numRows; i++) {
        const row = allRows.nth(i);
        const element = (await row.getAttribute("class"))!;
        if (!element.includes("bm-marker-row")) continue; // Actual event elemnt, not date element
        
        const headerText = (await row.innerText()).trim();
        if (headerText.startsWith(targetDateHeader)) {
            console.log(`Located actual date header text: ${headerText}`);
            targetDateIndex = i;
            break;
        }
    }

    if (targetDateIndex == -1) {
        throw new Error ("No date row found for the target date");
    }
    
    const time12 = to12Hour(eventConfig.time);
    console.log(`Target time: ${time12}`);
    let targetEventRow: Locator | null = null;

    for (let i = targetDateIndex + 1; i < numRows; i++) {
        const row = allRows.nth(i);
        const element = (await row.getAttribute("class"))!;
        if (!element.includes("bm-class-row")) break; // Date element, not actual event element
        
        const infoText = await row.innerText();
        const timeLabel = await row.locator('span[aria-label^="Event time"]').innerText();

        if (infoText.includes(eventConfig.sport) && infoText.includes(eventConfig.location) && timeLabel.startsWith(time12)) {
            if (infoText.includes("Full")) {
                throw new Error("Target event is full");
            }

            targetEventRow = row;
            console.log("Event found");
            break;
        }
    }

    if (!targetEventRow) {
        throw new Error("No event found");
    }

    return targetEventRow;
}

async function login(page: Page) {
    console.log("Logging in...");

    await page.locator('#username').fill(PROFILE.username);
    await page.locator('#password').fill(PROFILE.password);

    const error = page
        .locator('#error')
        .waitFor({ state: "visible" })
        .then(() => { throw new Error("Invalid username or password") })

    const success = page
        .waitForURL(CONFIG.loggedInUrl, { waitUntil: 'domcontentloaded' })
        .then(() => "success" as const)

    const timeout = new Promise((res) =>
        setTimeout(() => res("timeout"), CONFIG.timeout)
    );

    await page.getByRole('button', { name: /sign in/i }).click();
    const result = await Promise.race([error, success, timeout]);

    if (result == "success") {
        console.log("Log in successful");
        return;
    }

    throw new Error("Login attempt timed out");
}

async function locateEvent(page: Page, eventConfig: EventConfig) {
    console.log("Locating event...");
    if (!eventConfig) {
        throw new Error("Invalid drop-in event");
    }
    console.log(eventConfig);
    
    await page.locator('#load-more').click();
    await page.locator('#bm-overlay').waitFor({ state: 'hidden' });

    const targetDate = getTargetDate(eventConfig);
    const weekdayHeader = targetDate.toLocaleDateString("en-US", { weekday: "short"});
    const monthHeader = targetDate.toLocaleDateString("en-US", { month: "short"});
    const targetDateHeader = `${weekdayHeader}, ${monthHeader} ${targetDate.getDate()}`;
    console.log(`Target Date Header: ${targetDateHeader}`);

    const allRows = page.locator("#classes tr");
    const targetEventRow = await findTargetRow(allRows, targetDateHeader, eventConfig);
    
    await targetEventRow.getByRole("button").click();
}

async function completePayment(page: Page) {
    page.locator('#event-participants tr')

    const targetAttendeeRow = page
        .locator("#event-participants tr.bm-selectable-row")
        .filter({ hasText: dropinConfig.name });
    const checkbox = targetAttendeeRow.getByRole("checkbox");
    await checkbox.check();
    await page.getByRole("link", { name: "Next" }).click();

    await page.locator("table.bm-extras-prices").waitFor({ state: "visible" });
    const rows = page.locator("table.bm-extras-prices tr.radio-item");
    const freeRows = rows.filter({ hasText: "Free" });
    if (await freeRows.count()) {
        console.log("Membership found");
        await freeRows.first().getByRole("radio").check();
    } else {
        console.log("Payment required");
        rows.first().getByRole("radio").check();
    }
    await page.getByRole("link", { name: "Next" }).click();

    const checkoutFrame = page.frameLocator("iframe.online-store");
    const placeOrderButton = checkoutFrame.getByRole("button", { name: /place my order/i });
    await page.waitForTimeout(10000);
    await placeOrderButton.click();

    const confirmationText = page.getByText(/thank you/i);
    await confirmationText.waitFor({ state: "visible" });
    console.log("Payment successful");
}

async function register(page: Page, eventConfig: EventConfig) {
    await locateEvent(page, eventConfig);
    await page.locator(".event-info-column").waitFor({ state: "visible" });
    console.log("Registering...");

    const deadline = Date.now() + CONFIG.registerWaitTimeout;
    const registerButton = page.locator('#bookEventButton');
    const totalSeconds = Math.floor(CONFIG.refreshInterval / 1000);
    while (Date.now() < deadline) {
        for (let sec = totalSeconds; sec > 0; sec--) {
            if (await registerButton.isVisible()) {
                console.log("Registration open");

                await registerButton.click();
                await completePayment(page);
                return;
            }

            await displayRefreshTimer(page, `Refreshing in ${sec}s...`);
            await page.waitForTimeout(1000);
        }
        await page.reload({ waitUntil: "domcontentloaded" });
    }

    throw new Error(`Register button did not appear within ${Math.floor(CONFIG.registerWaitTimeout / 1000)} seconds`);
}

async function main() {
    console.log("Start");

    const eventName = dropinConfig["event-name"];
    const eventConfig = events.find(e => e.name == eventName);
    if (!eventConfig) throw new Error("Invalid drop-in event");
    
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto(CONFIG.baseUrl, { waitUntil: "domcontentloaded" });

    await login(page);
    
    const dropIn = page.getByRole('link', { name: "Drop-In Programs" });

    if (await dropIn.isVisible()) {
        await dropIn.click();
    } else {
        const moreMenu = page.getByRole('menuitem', { name: "More" });
        await moreMenu.hover();
        await dropIn.waitFor({ state: 'visible' });
        await dropIn.click();
    }

    const selectionList = page.locator('ul[data-bind*="foreach: calendars"]');
    await selectionList.getByText('Sports Drop-in').click();

    await register(page, eventConfig);
}

if (!PROFILE.username || !PROFILE.password) {
    throw new Error("Invalid environment variables username or password");
}

try {
    await main();
} catch (e) {
    console.error("Error: ", e);
}

