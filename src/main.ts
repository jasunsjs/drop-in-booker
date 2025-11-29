import { chromium } from "playwright";
import eventsJson from "../dropin-events.json" with { type: "json" };
import {
    CONFIG,
    PROFILE,
    dropinConfig,
    type EventConfig, 
} from "./config.js"
import { login, register } from "./booking.js"

const events = eventsJson as EventConfig[];

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

