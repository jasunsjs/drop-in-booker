import "dotenv/config";
import dropinConfigJson from "../dropin.config.json" with { type: "json" };

export type EventConfig = {
    name: string;
    sport: string;
    location: string;
    day: string; // Day of the week
    time: string; // "HH:MM" 24h
};

export type DropinConfig = {
    name: string;
    "event-name": string;
    "book-for-tmr": boolean;
};

export const dropinConfig = dropinConfigJson as DropinConfig;

export const CONFIG = {
    baseUrl: "https://townofoakville.perfectmind.com/",
    loggedInUrl: /\/MyProfile\/Contact(?:\/|$)/,
    timeout: 8000,
    headless: false,
    refreshInterval: 3000,
    registerWaitTimeout: 10 * 60 * 1000, // 10 mins
} as const;

export const PROFILE = {
    username: process.env[`${dropinConfig.name.replace(/\s+/g, "_").toUpperCase()}_USERNAME`]!,
    password: process.env[`${dropinConfig.name.replace(/\s+/g, "_").toUpperCase()}_PASSWORD`]!,
}

export const DOW_INDEX: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
} as const;



