import { chromium } from "playwright";
import "dotenv/config";
import type { Page } from "playwright";
import dropinConfig from "../dropin.config.json" with { type: "json" };
import events from "../dropin-events.json" with { type: "json" };

const CONFIG = {
    baseUrl: "https://townofoakville.perfectmind.com/",
    loggedInUrl: /\/MyProfile\/Contact(?:\/|$)/,
    timeout: 8000, // MS
    headless: false,
    refreshInterval: 2000 // MS
};

const PROFILE = {
    username: process.env[`${dropinConfig.name.toUpperCase()}_USERNAME`]!,
    password: process.env[`${dropinConfig.name.toUpperCase()}_PASSWORD`]!,
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
    } else {
        throw new Error(`Invalid time format: ${time24}`);
    }
}

function getTargetDate(eventConfig: EventConfig): Date {
    const today = new Date();
    const target = new Date(today);
    const todayDOW = today.getDay();
    const targetDOW = DOW_INDEX[eventConfig.day]!;
    let diff = targetDOW - todayDOW;
    if (diff < 0) 
        diff += 7; // Calculate number of days ahead 

    if (diff == 1 && !dropinConfig["book-for-tmr"]) 
        diff += 7;

    target.setDate(target.getDate() + diff);
    return target;
}

async function login(page: Page) {
    console.log("Login");

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

    if (result == "success") return;

    throw new Error("Login attempt timed out");
}

async function register(page: Page, eventConfig: EventConfig) {
    console.log("Register");
    if (!eventConfig) {
        throw new Error("Invalid drop-in event");
    }
    console.log(eventConfig);
    
    page.locator('#load-more').click();

    const targetDate = getTargetDate(eventConfig);
    const weekdayHeader = targetDate.toLocaleDateString("en-US", { weekday: "short"});
    const monthHeader = targetDate.toLocaleDateString("en-US", { month: "short"});
    const targetDateHeader = `${weekdayHeader}, ${monthHeader} ${targetDate.getDate()}`;
    console.log(`Target Date Header: ${targetDateHeader}`);




    const rows = page.locator('#classes tr.bm-class-row');

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

