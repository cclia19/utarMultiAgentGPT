"use client";

import { AnimatePresence, motion, type MotionValue } from "framer-motion";
import { useEffect, useId, useRef } from "react";

/**
 * Little Snoopy-style scenes for the mascot on the empty chat screen: coffee,
 * reading, basketball, coding, fishing, dancing, a backflip, chasing a runaway
 * avocado and juggling avocados (the avocado is a nod to Avo, who made
 * UTARCHAT; the basketball is one too). Each runs 6-8 s, then he returns to
 * his normal pose.
 *
 * Everything is in the mascot's own units (the 582 × 812 cut-out; floor at
 * y = 812). The scene layer is a larger SVG around him (x -582…1164,
 * y -300…812) so props can sit beside him: a hoop on the left, a pond on the
 * right, a code panel above. Props held in his hand follow the arm angle.
 */

export type SceneId = "coffee" | "book" | "basketball" | "coding" | "fishing" | "dance" | "flip" | "chase" | "juggle";
export const SCENES: SceneId[] = ["coffee", "book", "basketball", "coding", "fishing", "dance", "flip", "chase", "juggle"];

export type Held = "cup" | "book" | "ball" | "rod" | "avo" | null;
export type Face = {
    eyes?: "open" | "happy" | "closed";
    look?: { x: number; y: number };
    mouth?: "default" | "open" | "o" | "smirk";
    blush?: boolean;
    shades?: boolean;
};
export type Fx = {
    hoop?: boolean;
    score?: boolean;
    ballFree?: boolean;
    pond?: boolean;
    bobber?: "bob" | "bite";
    line?: boolean;
    fish?: "hooked" | "release";
    laptop?: boolean;
    code?: boolean;
    deployed?: boolean;
    notes?: boolean;
    bulb?: boolean;
    runner?: "run" | "wink";
    juggle?: boolean;
    sparkle?: number; // change to burst
    sparkleAt?: { x: number; y: number };
    pageFlip?: boolean;
};

// The arm: shoulder pivot and the glove's centre at rest. His arm is short and
// his head big: past about -110° the glove lands on his face, so raised poses
// stay at wave height (RAISED / RAISED_HIGH).
export const RAISED = -96;
const RAISED_HIGH = -110;
export const PIVOT = { x: 395, y: 471 };
const HAND = { x: 420, y: 590 };

/** Where the hand is when the arm is rotated by `deg` (clockwise positive). */
export function handAt(deg: number) {
    const r = (deg * Math.PI) / 180;
    const dx = HAND.x - PIVOT.x;
    const dy = HAND.y - PIVOT.y;
    return { x: PIVOT.x + dx * Math.cos(r) - dy * Math.sin(r), y: PIVOT.y + dx * Math.sin(r) + dy * Math.cos(r) };
}

const ROD_TIP = { x: 300, y: -260 }; // from the grip, before tilt
const BOBBER = { x: 880, y: 792 };

export type SceneCtl = {
    animate: (mv: MotionValue<number>, to: number | number[], opts?: object) => Promise<void>;
    arm: MotionValue<number>;
    tilt: MotionValue<number>;
    body: { x: MotionValue<number>; y: MotionValue<number>; rot: MotionValue<number>; sx: MotionValue<number>; sy: MotionValue<number> };
    legL: MotionValue<number>;
    legR: MotionValue<number>;
    ball: { x: MotionValue<number>; y: MotionValue<number>; r: MotionValue<number>; o: MotionValue<number> };
    reel: MotionValue<number>;
    jug: MotionValue<number>;
    runner: { x: MotionValue<number>; y: MotionValue<number> };
    setHeld: (h: Held) => void;
    setFace: (f: Face | null) => void;
    setFx: (f: Fx) => void;
    patchFx: (f: Partial<Fx>) => void;
    boing: (amount?: number) => void;
    hop: () => Promise<void>;
    sleep: (ms: number) => Promise<void>;
    alive: () => boolean;
    /** The screen edges, in his units (x = 0 is his left edge, 582 his right). */
    screen: () => { left: number; right: number };
};

const spring = (stiffness = 220, damping = 20) => ({ type: "spring" as const, stiffness, damping });

/** One scene, start to finish. Stops early (without resetting) when the run is cancelled; the director resets. */
export async function runScene(id: SceneId, c: SceneCtl) {
    const { animate, sleep, alive } = c;
    const sparkle = (x: number, y: number) => c.patchFx({ sparkle: Date.now(), sparkleAt: { x, y } });

    if (id === "coffee") {
        const rest = handAt(0);
        sparkle(rest.x - 30, rest.y);
        c.setHeld("cup");
        c.setFace({ eyes: "open", look: { x: 2, y: 1 }, mouth: "default" });
        await sleep(900);
        if (!alive()) return;
        // Bring the mug up, tip it, sip with eyes closed.
        await Promise.all([animate(c.arm, 140, spring(120, 18)), animate(c.tilt, 0, { duration: 0.6 })]);
        if (!alive()) return;
        c.setFace({ eyes: "closed", mouth: "default", blush: true });
        await animate(c.tilt, -28, { duration: 0.5, ease: "easeInOut" });
        await sleep(1100);
        if (!alive()) return;
        await animate(c.tilt, 0, { duration: 0.4 });
        // "Ahh": lower the mug to the chest, happy.
        await animate(c.arm, 62, spring(140, 18));
        c.setFace({ eyes: "happy", mouth: "open", blush: true });
        c.boing(0.7);
        await sleep(1200);
        if (!alive()) return;
        c.setFace({ eyes: "open", look: { x: 2, y: 2 }, mouth: "default" });
        await animate(c.arm, 140, spring(120, 18));
        c.setFace({ eyes: "closed", mouth: "default" });
        await animate(c.tilt, -32, { duration: 0.45 });
        await sleep(800);
        if (!alive()) return;
        await animate(c.tilt, 0, { duration: 0.3 });
        await animate(c.arm, 0, spring(140, 20));
        sparkle(rest.x - 30, rest.y);
        c.setHeld(null);
        c.setFace({ eyes: "happy", mouth: "default" });
        await sleep(600);
        return;
    }

    if (id === "book") {
        sparkle(330, 560);
        await animate(c.arm, 54, spring(160, 20));
        c.setHeld("book");
        c.setFace({ eyes: "open", look: { x: -1, y: 6 } });
        await sleep(1400);
        if (!alive()) return;
        c.patchFx({ pageFlip: true });
        await sleep(900);
        c.patchFx({ pageFlip: false });
        c.setFace({ eyes: "open", look: { x: 1, y: 6 } });
        await sleep(1300);
        if (!alive()) return;
        c.patchFx({ pageFlip: true });
        await sleep(900);
        c.patchFx({ pageFlip: false });
        // Idea!
        c.setFace({ eyes: "open", look: { x: 2, y: -3 }, mouth: "o" });
        c.patchFx({ bulb: true });
        c.boing(1);
        await sleep(1300);
        if (!alive()) return;
        c.setFace({ eyes: "happy", mouth: "open", blush: true });
        await sleep(900);
        c.patchFx({ bulb: false });
        sparkle(320, 560);
        c.setHeld(null);
        await animate(c.arm, 0, spring(160, 20));
        await sleep(300);
        return;
    }

    if (id === "basketball") {
        const rest = handAt(0);
        sparkle(rest.x, rest.y + 30);
        c.setHeld("ball");
        c.patchFx({ hoop: true });
        c.setFace({ eyes: "open", look: { x: -3, y: 0 } });
        await sleep(700);
        if (!alive()) return;
        // Dribble twice: the ball leaves the hand, hits the floor, comes back.
        for (let i = 0; i < 2; i++) {
            const h = handAt(c.arm.get());
            c.ball.x.set(h.x);
            c.ball.y.set(h.y + 36);
            c.ball.o.set(1);
            c.patchFx({ ballFree: true });
            c.setHeld(null);
            animate(c.arm, [0, -12, 0], { duration: 0.5 });
            await animate(c.ball.y, [h.y + 36, 812 - 34, h.y + 36], { duration: 0.5, ease: ["easeIn", "easeOut"] });
            c.setHeld("ball");
            c.patchFx({ ballFree: false });
            if (!alive()) return;
        }
        // Wind up overhead, then shoot.
        c.setFace({ eyes: "open", look: { x: -3, y: -3 }, mouth: "o" });
        await animate(c.arm, RAISED_HIGH, spring(170, 16));
        if (!alive()) return;
        await sleep(250);
        const h = handAt(RAISED_HIGH);
        c.ball.x.set(h.x);
        c.ball.y.set(h.y - 38);
        c.ball.r.set(0);
        c.patchFx({ ballFree: true });
        c.setHeld(null);
        animate(c.arm, -86, { duration: 0.2 });
        // Arc to the rim (on the left), through the net, then bounce away.
        await Promise.all([
            animate(c.ball.x, -250, { duration: 1.05, ease: "linear" }),
            animate(c.ball.y, [h.y - 38, -170, 128], { duration: 1.05, times: [0, 0.5, 1], ease: ["easeOut", "easeIn"] }),
            animate(c.ball.r, -540, { duration: 1.05, ease: "linear" }),
        ]);
        if (!alive()) return;
        await animate(c.ball.y, 250, { duration: 0.28, ease: "easeIn" });
        c.patchFx({ score: true });
        c.setFace({ eyes: "happy", mouth: "open", blush: true });
        animate(c.arm, -100, spring(160, 14));
        animate(c.ball.x, -200, { duration: 0.9 });
        animate(c.ball.y, [250, 812 - 34, 640, 812 - 34, 740, 812 - 34], { duration: 0.9, ease: "easeIn" });
        await c.hop();
        if (!alive()) return;
        await animate(c.arm, [-100, -110, -88, -108, -96], { duration: 0.9 });
        await animate(c.ball.o, 0, { duration: 0.3 });
        c.patchFx({ ballFree: false, score: false, hoop: false });
        await animate(c.arm, 0, spring(150, 18));
        return;
    }

    if (id === "coding") {
        c.setFace({ eyes: "open", look: { x: 0, y: 2 }, mouth: "smirk", shades: true });
        c.boing(0.6);
        await sleep(700);
        if (!alive()) return;
        c.patchFx({ laptop: true });
        await sleep(500);
        await animate(c.arm, 33, spring(160, 20));
        c.patchFx({ code: true });
        // Typing: quick little taps.
        for (let i = 0; i < 14 && alive(); i++) {
            await animate(c.arm, [33, 28 + Math.random() * 3, 33], { duration: 0.16 + Math.random() * 0.08 });
            if (i === 6) {
                c.setFace({ eyes: "open", look: { x: -3, y: -2 }, mouth: "smirk", shades: true });
                c.boing(0.3);
            }
        }
        if (!alive()) return;
        c.patchFx({ deployed: true });
        c.setFace({ eyes: "open", look: { x: -2, y: -2 }, mouth: "open", shades: true });
        await animate(c.arm, -100, spring(170, 14));
        await animate(c.arm, [-100, -110, -94], { duration: 0.6 });
        await sleep(900);
        if (!alive()) return;
        c.patchFx({ laptop: false, code: false, deployed: false });
        c.setFace({ eyes: "happy", mouth: "open", blush: true });
        await animate(c.arm, 0, spring(150, 18));
        await sleep(500);
        return;
    }

    if (id === "fishing") {
        c.patchFx({ pond: true });
        sparkle(handAt(0).x, handAt(0).y);
        c.setHeld("rod");
        c.tilt.set(0);
        c.setFace({ eyes: "open", look: { x: 3, y: 1 } });
        await animate(c.arm, -48, spring(150, 20));
        if (!alive()) return;
        // Cast: rod back, then flick forward.
        await animate(c.tilt, -22, { duration: 0.35, ease: "easeOut" });
        c.reel.set(0);
        c.patchFx({ line: true, bobber: "bob" });
        await animate(c.tilt, 10, { duration: 0.25, ease: "easeIn" });
        await animate(c.tilt, 0, spring(200, 12));
        if (!alive()) return;
        c.setFace({ eyes: "open", look: { x: 3, y: 2 }, mouth: "default" });
        await sleep(1500);
        if (!alive()) return;
        // A bite!
        c.patchFx({ bobber: "bite" });
        c.setFace({ eyes: "open", look: { x: 3, y: 2 }, mouth: "o" });
        await sleep(700);
        if (!alive()) return;
        c.patchFx({ bobber: undefined, fish: "hooked" });
        await Promise.all([animate(c.tilt, -26, spring(260, 14)), animate(c.reel, 1, { duration: 0.6, ease: "easeOut" }), animate(c.arm, -60, { duration: 0.3 })]);
        c.setFace({ eyes: "happy", mouth: "open", blush: true });
        c.boing(1);
        await sleep(1400);
        if (!alive()) return;
        // Catch and release.
        c.patchFx({ fish: "release" });
        await animate(c.reel, 0, { duration: 0.5 });
        c.patchFx({ line: false, fish: undefined });
        c.setFace({ eyes: "happy", mouth: "default" });
        await animate(c.arm, 0, spring(150, 20));
        c.setHeld(null);
        sparkle(handAt(0).x, handAt(0).y);
        c.patchFx({ pond: false });
        await sleep(500);
        return;
    }

    if (id === "dance") {
        c.patchFx({ notes: true });
        c.setFace({ eyes: "happy", mouth: "open", blush: true });
        const beat = 0.42;
        for (let i = 0; i < 8 && alive(); i++) {
            const side = i % 2 === 0 ? 1 : -1;
            animate(c.body.y, [0, -4, 0], { duration: beat });
            animate(c.body.rot, side * 7, { duration: beat, ease: "easeInOut" });
            animate(side > 0 ? c.legL : c.legR, [0, side * 16, 0], { duration: beat });
            animate(c.arm, i % 4 < 2 ? RAISED_HIGH : -86, { duration: beat * 0.8 });
            if (i === 3) c.boing(1);
            await sleep(beat * 1000);
        }
        if (!alive()) return;
        // Spin.
        c.setFace({ eyes: "open", look: { x: 0, y: 0 }, mouth: "smirk", shades: true });
        animate(c.body.rot, 0, { duration: 0.2 });
        await animate(c.body.sx, [1, -1, 1, -1, 1], { duration: 0.8, ease: "easeInOut" });
        if (!alive()) return;
        // Freeze pose.
        animate(c.body.rot, -6, spring(300, 14));
        await animate(c.arm, RAISED_HIGH, spring(260, 12));
        sparkle(300, 200);
        await sleep(1000);
        if (!alive()) return;
        c.patchFx({ notes: false });
        animate(c.body.rot, 0, { duration: 0.3 });
        c.setFace({ eyes: "happy", mouth: "open" });
        await animate(c.arm, 0, spring(150, 18));
        await sleep(400);
        return;
    }

    if (id === "flip") {
        c.setFace({ eyes: "open", look: { x: 0, y: -3 }, mouth: "o" });
        // Anticipation: crouch.
        await Promise.all([animate(c.body.sy, 0.86, { duration: 0.35, ease: "easeOut" }), animate(c.body.sx, 1.08, { duration: 0.35 }), animate(c.arm, 30, { duration: 0.35 })]);
        if (!alive()) return;
        c.setFace({ eyes: "happy", mouth: "open" });
        // Up, flip, down.
        animate(c.body.sy, [1.08, 1], { duration: 0.3 });
        animate(c.body.sx, [0.94, 1], { duration: 0.3 });
        animate(c.arm, RAISED, { duration: 0.3 });
        await Promise.all([
            animate(c.body.y, [0, -42, -42, 0], { duration: 0.95, times: [0, 0.35, 0.6, 1], ease: ["easeOut", "linear", "easeIn"] }),
            animate(c.body.rot, [0, 0, -360], { duration: 0.95, times: [0, 0.12, 0.85], ease: "easeInOut" }),
        ]);
        if (!alive()) return;
        c.body.rot.set(0);
        // Stick the landing.
        await Promise.all([animate(c.body.sy, 0.88, { duration: 0.08 }), animate(c.body.sx, 1.1, { duration: 0.08 })]);
        animate(c.body.sy, 1, spring(500, 12));
        animate(c.body.sx, 1, spring(500, 12));
        sparkle(291, 760);
        c.setFace({ eyes: "happy", mouth: "open", blush: true });
        await animate(c.arm, RAISED_HIGH, spring(260, 12));
        c.boing(1);
        await sleep(1500);
        if (!alive()) return;
        await animate(c.arm, 0, spring(150, 18));
        await sleep(400);
        return;
    }

    if (id === "juggle") {
        c.setFace({ eyes: "open", look: { x: 0, y: 4 }, mouth: "o" });
        c.jug.set(0);
        c.patchFx({ juggle: true });
        // The arm tosses each time an avocado leaves the right hand.
        const tosses = animate(c.arm, [0, -16, 0], { duration: 0.5, repeat: 9, ease: "easeInOut" });
        await sleep(1200);
        if (!alive()) return;
        c.setFace({ eyes: "open", look: { x: 0, y: 4 }, mouth: "open", blush: true });
        await Promise.all([animate(c.jug, 3, { duration: 4.5, ease: "linear" }), tosses]);
        if (!alive()) return;
        c.patchFx({ juggle: false });
        sparkle(300, 300);
        c.setFace({ eyes: "happy", mouth: "open", blush: true });
        c.boing(1);
        await animate(c.arm, -110, spring(220, 14));
        await sleep(900);
        if (!alive()) return;
        await animate(c.arm, 0, spring(150, 18));
        return;
    }

    if (id === "chase") {
        const edge = c.screen();
        // A little avocado hops in from the left edge of the screen...
        c.runner.x.set(edge.left - 160);
        c.runner.y.set(0);
        c.patchFx({ runner: "run" });
        const hopIn = Math.min(2, Math.max(1, (-150 - edge.left) / 1600));
        animate(c.runner.y, [0, -50, 0, -50, 0, -50, 0, -50, 0], { duration: hopIn });
        await animate(c.runner.x, -150, { duration: hopIn, ease: "easeOut" });
        if (!alive()) return;
        c.setFace({ eyes: "open", look: { x: -4, y: 1 }, mouth: "o" });
        c.patchFx({ runner: "wink" });
        await sleep(900);
        if (!alive()) return;
        // ...and dashes off past him, out of the right edge.
        c.patchFx({ runner: "run" });
        c.setFace({ eyes: "open", look: { x: 4, y: 1 }, mouth: "o" });
        const dash = Math.min(1.6, Math.max(0.9, (edge.right + 200) / 2600));
        animate(c.runner.y, [0, -40, 0, -40, 0, -40, 0, -40, 0], { duration: dash });
        await animate(c.runner.x, edge.right + 200, { duration: dash, ease: "easeIn" });
        if (!alive()) return;
        // He gives chase, all the way off the screen.
        c.setFace({ eyes: "open", look: { x: 4, y: 0 }, mouth: "open" });
        await animate(c.body.rot, 9, { duration: 0.2 });
        const run = (dur: number) =>
            Promise.all([
                animate(c.body.y, [0, -4, 0, -4, 0, -4, 0, -4, 0, -4, 0], { duration: dur }),
                animate(c.legL, [0, 18, -14, 18, -14, 18, 0], { duration: dur }),
                animate(c.legR, [0, -14, 18, -14, 18, -14, 0], { duration: dur }),
                animate(c.arm, [0, -40, 20, -40, 20, -40, 0], { duration: dur }),
            ]);
        const out = edge.right + 80;
        const runOut = Math.min(1.8, Math.max(1, out / 2400));
        await Promise.all([animate(c.body.x, out, { duration: runOut, ease: "easeIn" }), run(runOut)]);
        if (!alive()) return;
        c.patchFx({ runner: undefined });
        await sleep(700);
        if (!alive()) return;
        // Back in from the left edge, avocado in hand.
        c.body.x.set(edge.left - 660);
        c.body.rot.set(0);
        c.setHeld("avo");
        c.arm.set(-100);
        c.setFace({ eyes: "happy", mouth: "open", blush: true });
        const back = Math.min(2, Math.max(1.2, (660 - edge.left) / 1800));
        await Promise.all([animate(c.body.x, 0, { duration: back, ease: "easeOut" }), animate(c.body.y, [0, -4, 0, -4, 0, -4, 0, -4, 0], { duration: back })]);
        if (!alive()) return;
        c.boing(1);
        await animate(c.arm, [-100, -110, -90, -108, -98], { duration: 1 });
        await sleep(500);
        if (!alive()) return;
        sparkle(handAt(-100).x, handAt(-100).y - 40);
        c.setHeld(null);
        await animate(c.arm, 0, spring(150, 18));
        return;
    }
}

/* ------------------------------------------------------------------ */
/* Drawing                                                              */
/* ------------------------------------------------------------------ */

const VB = { x: -582, y: -300, w: 1746, h: 1112 };

/** The scene layer, placed over the mascot (same units). */
export function SceneLayer({
    held,
    fx,
    arm,
    tilt,
    ball,
    reel,
    jug,
    runner,
    bodyX,
}: {
    held: Held;
    fx: Fx;
    arm: MotionValue<number>;
    tilt: MotionValue<number>;
    ball: SceneCtl["ball"];
    reel: MotionValue<number>;
    jug: MotionValue<number>;
    runner: SceneCtl["runner"];
    bodyX: MotionValue<number>;
}) {
    const uid = useId().replace(/:/g, "");
    const g = (n: string) => `${uid}-${n}`;
    const heldRef = useRef<SVGGElement>(null);
    const lineRef = useRef<SVGPathElement>(null);
    const fishRef = useRef<SVGGElement>(null);

    // Held props and the fishing line follow the arm (and the rod's tilt).
    useEffect(() => {
        const update = () => {
            const h = handAt(arm.get());
            h.x += bodyX.get();
            const t = tilt.get();
            heldRef.current?.setAttribute("transform", `translate(${h.x.toFixed(1)} ${h.y.toFixed(1)}) rotate(${t.toFixed(2)})`);
            if (lineRef.current || fishRef.current) {
                const r = (t * Math.PI) / 180;
                const tip = { x: h.x + ROD_TIP.x * Math.cos(r) - ROD_TIP.y * Math.sin(r), y: h.y + ROD_TIP.x * Math.sin(r) + ROD_TIP.y * Math.cos(r) };
                const k = reel.get();
                const end = { x: BOBBER.x + (tip.x - BOBBER.x) * k, y: BOBBER.y - 8 + (tip.y + 90 - (BOBBER.y - 8)) * k };
                const sag = 70 * (1 - k);
                const mid = { x: (tip.x + end.x) / 2, y: Math.max(tip.y, end.y) + sag - 40 * (1 - k) };
                lineRef.current?.setAttribute("d", `M${tip.x.toFixed(1)} ${tip.y.toFixed(1)} Q${mid.x.toFixed(1)} ${mid.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`);
                fishRef.current?.setAttribute("transform", `translate(${end.x.toFixed(1)} ${(end.y + 10).toFixed(1)})`);
            }
        };
        update();
        const subs = [arm.on("change", update), tilt.on("change", update), reel.on("change", update), bodyX.on("change", update)];
        return () => subs.forEach((u) => u());
    }, [arm, tilt, reel, bodyX, held, fx.line, fx.fish]);

    return (
        <svg
            viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
            className="pointer-events-none absolute overflow-visible"
            style={{ left: `${(VB.x / 582) * 100}%`, top: `${(VB.y / 812) * 100}%`, width: `${(VB.w / 582) * 100}%`, height: `${(VB.h / 812) * 100}%` }}
            aria-hidden
        >
            <defs>
                <radialGradient id={g("ball")} cx="35%" cy="30%" r="75%">
                    <stop offset="0" stopColor="#ffb562" />
                    <stop offset="0.55" stopColor="#f2741f" />
                    <stop offset="1" stopColor="#b6460c" />
                </radialGradient>
                <linearGradient id={g("mug")} x1="0" x2="1">
                    <stop offset="0" stopColor="#ffffff" />
                    <stop offset="0.6" stopColor="#eef2f9" />
                    <stop offset="1" stopColor="#c9d3e6" />
                </linearGradient>
                <linearGradient id={g("water")} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#7dd3fc" />
                    <stop offset="1" stopColor="#1d72c4" />
                </linearGradient>
                <linearGradient id={g("lid")} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#4b5563" />
                    <stop offset="1" stopColor="#1f2937" />
                </linearGradient>
                <linearGradient id={g("glass")} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#1e293b" stopOpacity="0.96" />
                    <stop offset="1" stopColor="#0f172a" stopOpacity="0.96" />
                </linearGradient>
                <radialGradient id={g("glow")}>
                    <stop offset="0" stopColor="#fde68a" stopOpacity="0.9" />
                    <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
                </radialGradient>
                <linearGradient id={g("rod")} x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0" stopColor="#7c4a1e" />
                    <stop offset="1" stopColor="#2b2b2b" />
                </linearGradient>
                <linearGradient id={g("avo-skin")} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#4d7c0f" />
                    <stop offset="1" stopColor="#14532d" />
                </linearGradient>
                <radialGradient id={g("avo-flesh")} cx="0.45" cy="0.4" r="0.7">
                    <stop offset="0" stopColor="#fef9c3" />
                    <stop offset="0.55" stopColor="#d9f99d" />
                    <stop offset="1" stopColor="#a3e635" />
                </radialGradient>
                <radialGradient id={g("avo-pit")} cx="0.35" cy="0.3" r="0.75">
                    <stop offset="0" stopColor="#d6a676" />
                    <stop offset="0.6" stopColor="#92562b" />
                    <stop offset="1" stopColor="#5b3416" />
                </radialGradient>
                <linearGradient id={g("fish")} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#ffb347" />
                    <stop offset="1" stopColor="#f2611d" />
                </linearGradient>
            </defs>

            {/* Basketball hoop (left) */}
            <AnimatePresence>
                {fx.hoop && (
                    <motion.g key="hoop" initial={{ scaleY: 0, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} exit={{ scaleY: 0, opacity: 0 }} transition={spring(240, 18)} style={{ originY: 1 }}>
                        <rect x="-266" y="120" width="22" height="692" rx="8" fill="#64748b" />
                        <rect x="-335" y="-10" width="170" height="118" rx="12" fill="#ffffff" stroke="#cbd5e1" strokeWidth="6" />
                        <rect x="-283" y="40" width="66" height="52" rx="4" fill="none" stroke="#e31837" strokeWidth="7" />
                        <g>
                            {[-300, -280, -260, -240, -220, -200].map((x, i) => (
                                <motion.path
                                    key={x}
                                    d={`M${x} 140 L${-250 + (x + 250) * 0.6} 225`}
                                    stroke="#f8fafc"
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                    animate={fx.score ? { pathLength: [1, 0.75, 1] } : { pathLength: 1 }}
                                    transition={{ duration: 0.35, delay: i * 0.02 }}
                                />
                            ))}
                            <path d="M-292 170 L-208 170 M-284 198 L-216 198" stroke="#f8fafc" strokeWidth="3" />
                        </g>
                        <ellipse cx="-250" cy="138" rx="62" ry="12" fill="none" stroke="#f97316" strokeWidth="9" />
                    </motion.g>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {fx.score && (
                    <motion.text
                        key="score"
                        x="-250"
                        y="-40"
                        textAnchor="middle"
                        fontSize="96"
                        fontWeight="800"
                        fill="#f97316"
                        initial={{ opacity: 0, y: 30, scale: 0.4 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -30 }}
                        transition={spring(400, 16)}
                        style={{ fontFamily: "inherit" }}
                    >
                        +2
                    </motion.text>
                )}
            </AnimatePresence>

            {/* Pond (right) */}
            <AnimatePresence>
                {fx.pond && (
                    <motion.g key="pond" initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }} exit={{ scaleX: 0, opacity: 0 }} transition={spring(200, 22)}>
                        <ellipse cx="880" cy="796" rx="220" ry="34" fill={`url(#${g("water")})`} />
                        <ellipse cx="860" cy="786" rx="150" ry="10" fill="#ffffff" opacity="0.35" />
                        {[0, 1].map((i) => (
                            <motion.ellipse
                                key={i}
                                cx={BOBBER.x}
                                cy={BOBBER.y + 4}
                                rx="30"
                                ry="6"
                                fill="none"
                                stroke="#e0f2fe"
                                strokeWidth="3"
                                animate={fx.bobber || fx.fish ? { scale: [0.4, 2.2], opacity: [0.9, 0] } : { opacity: 0 }}
                                transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.8 }}
                            />
                        ))}
                    </motion.g>
                )}
            </AnimatePresence>
            {fx.line && <path ref={lineRef} fill="none" stroke="#e2e8f0" strokeWidth="2.5" />}
            <AnimatePresence>
                {fx.bobber && (
                    <motion.g
                        key="bobber"
                        initial={{ opacity: 0 }}
                        animate={fx.bobber === "bite" ? { opacity: 1, y: [0, 16, 0, 18, 2] } : { opacity: 1, y: [0, 5, 0] }}
                        exit={{ opacity: 0 }}
                        transition={fx.bobber === "bite" ? { duration: 0.7 } : { duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                    >
                        <circle cx={BOBBER.x} cy={BOBBER.y - 10} r="14" fill="#ef4444" />
                        <path d={`M${BOBBER.x - 14} ${BOBBER.y - 10} A14 14 0 0 0 ${BOBBER.x + 14} ${BOBBER.y - 10} Z`} fill="#ffffff" />
                    </motion.g>
                )}
            </AnimatePresence>
            {fx.fish && (
                <g ref={fishRef}>
                    <motion.g
                        animate={fx.fish === "hooked" ? { rotate: [-18, 22, -18] } : { y: [0, -120, 260], x: [0, 60, 120], rotate: [0, 90, 180], opacity: [1, 1, 0] }}
                        transition={fx.fish === "hooked" ? { duration: 0.32, repeat: Infinity } : { duration: 0.6, ease: "easeIn" }}
                        style={{ originX: 0.5, originY: 0 }}
                    >
                        <ellipse cx="0" cy="34" rx="22" ry="38" fill={`url(#${g("fish")})`} />
                        <path d="M0 66 L-20 98 L20 98 Z" fill="#f2611d" />
                        <circle cx="-8" cy="18" r="5" fill="#16161d" />
                        <circle cx="-9" cy="16" r="1.6" fill="#ffffff" />
                        <path d="M-12 40 Q0 48 12 40" stroke="#ffd59a" strokeWidth="3" fill="none" />
                    </motion.g>
                </g>
            )}

            {/* Laptop (in front of him) and the code panel (above left) */}
            <AnimatePresence>
                {fx.laptop && (
                    <motion.g key="laptop" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }} transition={spring(220, 22)}>
                        <ellipse cx="300" cy="545" rx="120" ry="60" fill="#38bdf8" opacity="0.18" />
                        <motion.g initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.15, ...spring(200, 18) }} style={{ originY: 1 }}>
                            <rect x="182" y="520" width="236" height="148" rx="14" fill={`url(#${g("lid")})`} />
                            <rect x="190" y="526" width="220" height="6" rx="3" fill="#ffffff" opacity="0.12" />
                            <motion.circle cx="300" cy="594" r="16" fill="#e2e8f0" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.6, repeat: Infinity }} />
                        </motion.g>
                        <path d="M164 668 H436 L450 684 H150 Z" fill="#9ca3af" />
                        <rect x="150" y="684" width="300" height="6" rx="3" fill="#6b7280" />
                    </motion.g>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {fx.code && (
                    <motion.g key="code" initial={{ opacity: 0, scale: 0.85, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} transition={spring(260, 22)}>
                        <rect x="-470" y="60" width="360" height="230" rx="22" fill={`url(#${g("glass")})`} />
                        {["#ff5f57", "#febc2e", "#28c840"].map((c, i) => (
                            <circle key={c} cx={-440 + i * 26} cy="88" r="8" fill={c} />
                        ))}
                        {[
                            [["#c084fc", 60], ["#7dd3fc", 120]],
                            [["#7dd3fc", 40], ["#fde68a", 90], ["#e2e8f0", 50]],
                            [["#86efac", 150]],
                            [["#c084fc", 50], ["#e2e8f0", 140]],
                            [["#fda4af", 80], ["#7dd3fc", 70]],
                            [["#e2e8f0", 30]],
                        ].map((row, r) => {
                            let x = -440 + (r === 2 || r === 4 ? 28 : 0);
                            return (
                                <motion.g key={r} initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }} transition={{ delay: 0.3 + r * 0.45, duration: 0.4, ease: "easeOut" }} style={{ originX: 0 }}>
                                    {(row as [string, number][]).map(([color, w], i) => {
                                        const el = <rect key={i} x={x} y={120 + r * 26} width={w} height="12" rx="6" fill={color} />;
                                        x += w + 12;
                                        return el;
                                    })}
                                </motion.g>
                            );
                        })}
                        <motion.rect x="-440" y={120 + 5 * 26} width="10" height="16" fill="#e2e8f0" animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.8, repeat: Infinity }} />
                    </motion.g>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {fx.code &&
                    ["</>", "{ }", "01", ";"].map((t, i) => (
                        <motion.text
                            key={t}
                            x={220 + i * 50}
                            y="520"
                            fontSize="44"
                            fontWeight="700"
                            fill={["#38bdf8", "#a78bfa", "#34d399", "#f472b6"][i]}
                            initial={{ opacity: 0, y: 0 }}
                            animate={{ opacity: [0, 1, 0], y: -160 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 2, repeat: Infinity, delay: i * 0.5, ease: "easeOut" }}
                            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                        >
                            {t}
                        </motion.text>
                    ))}
            </AnimatePresence>
            <AnimatePresence>
                {fx.deployed && (
                    <motion.g key="deployed" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring(420, 16)}>
                        <rect x="-420" y="306" width="260" height="62" rx="31" fill="#16a34a" />
                        <path d="M-392 337 l14 14 l26 -28" stroke="#ffffff" strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        <text x="-338" y="350" fontSize="36" fontWeight="700" fill="#ffffff" style={{ fontFamily: "inherit" }}>
                            Deployed
                        </text>
                    </motion.g>
                )}
            </AnimatePresence>

            {/* Music notes */}
            <AnimatePresence>
                {fx.notes &&
                    ["♪", "♫", "♪", "♬"].map((t, i) => (
                        <motion.text
                            key={i}
                            x={[60, 470, 140, 520][i]}
                            y="260"
                            fontSize="84"
                            fill={["#6366f1", "#e31837", "#0ea5e9", "#f59e0b"][i]}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0, 1, 0], y: [0, -180], x: [0, i % 2 ? 30 : -30], rotate: [0, i % 2 ? 15 : -15] }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.45, ease: "easeOut" }}
                        >
                            {t}
                        </motion.text>
                    ))}
            </AnimatePresence>

            {/* Idea bulb */}
            <AnimatePresence>
                {fx.bulb && (
                    <motion.g key="bulb" initial={{ opacity: 0, scale: 0.3, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6 }} transition={spring(420, 14)}>
                        <motion.circle cx="140" cy="-40" r="90" fill={`url(#${g("glow")})`} animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />
                        <circle cx="140" cy="-50" r="40" fill="#fde047" stroke="#facc15" strokeWidth="4" />
                        <path d="M128 -48 q12 14 24 0" stroke="#f59e0b" strokeWidth="4" fill="none" />
                        <rect x="124" y="-12" width="32" height="20" rx="5" fill="#94a3b8" />
                        <path d="M126 -2 h28" stroke="#64748b" strokeWidth="3" />
                    </motion.g>
                )}
            </AnimatePresence>

            {/* Props in the hand */}
            {held && (
                <g ref={heldRef}>
                    <motion.g key={held} initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring(420, 18)}>
                        {held === "cup" && (
                            <g transform="scale(1.25)">
                                <path d="M-6 -30 C26 -30 26 14 -6 14" fill="none" stroke="#dbe3f0" strokeWidth="11" />
                                <rect x="-84" y="-50" width="80" height="86" rx="14" fill={`url(#${g("mug")})`} />
                                <rect x="-84" y="-12" width="80" height="14" fill="#e31837" />
                                <rect x="-84" y="2" width="80" height="6" fill="#1e3a8a" />
                                <ellipse cx="-44" cy="-50" rx="40" ry="9" fill="#6b3a1d" />
                                <ellipse cx="-44" cy="-50" rx="40" ry="9" fill="none" stroke="#ffffff" strokeWidth="4" />
                                {[0, 1, 2].map((i) => (
                                    <motion.path
                                        key={i}
                                        d={`M${-62 + i * 18} -64 q-10 -16 0 -32 q10 -16 0 -32`}
                                        stroke="#cbd5e1"
                                        strokeWidth="6"
                                        strokeLinecap="round"
                                        fill="none"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: [0, 0.8, 0], y: [10, -30] }}
                                        transition={{ duration: 2, repeat: Infinity, delay: i * 0.6, ease: "easeOut" }}
                                    />
                                ))}
                            </g>
                        )}
                        {held === "ball" && (
                            <g transform="translate(0 36)">
                                <Avo g={g} scale={1.15} />
                            </g>
                        )}
                        {held === "avo" && (
                            <g transform="translate(0 -70)">
                                <Avo g={g} scale={1.4} face="happy" />
                            </g>
                        )}
                        {held === "book" && (
                            <g transform="translate(-6 -18) scale(1.15)">
                                <rect x="-104" y="-70" width="208" height="134" rx="8" fill="#1e3a8a" />
                                <path d="M0 -62 C-30 -72 -70 -72 -98 -60 V56 C-70 46 -30 46 0 56 Z" fill="#fffaf0" />
                                <path d="M0 -62 C30 -72 70 -72 98 -60 V56 C70 46 30 46 0 56 Z" fill="#fff6e5" />
                                {[0, 1, 2, 3, 4].map((i) => (
                                    <g key={i}>
                                        <path d={`M-84 ${-38 + i * 18} H-16`} stroke="#94a3b8" strokeWidth="5" strokeLinecap="round" />
                                        <path d={`M16 ${-38 + i * 18} H${i === 4 ? 50 : 84}`} stroke="#94a3b8" strokeWidth="5" strokeLinecap="round" />
                                    </g>
                                ))}
                                <path d="M0 -62 V56" stroke="#d6c8a8" strokeWidth="3" />
                                <AnimatePresence>
                                    {fx.pageFlip && (
                                        <motion.path
                                            key="flip"
                                            d="M0 -62 C30 -72 70 -72 98 -60 V56 C70 46 30 46 0 56 Z"
                                            fill="#fffdf6"
                                            stroke="#e7dcc3"
                                            strokeWidth="2"
                                            initial={{ scaleX: 1 }}
                                            animate={{ scaleX: -1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.7, ease: "easeInOut" }}
                                            style={{ originX: 0 }}
                                        />
                                    )}
                                </AnimatePresence>
                            </g>
                        )}
                        {held === "rod" && (
                            <>
                                <path d={`M-4 4 L${ROD_TIP.x} ${ROD_TIP.y}`} stroke={`url(#${g("rod")})`} strokeWidth="9" strokeLinecap="round" />
                                <path d="M-10 10 L34 -28" stroke="#c08a52" strokeWidth="16" strokeLinecap="round" />
                                <circle cx="30" cy="-6" r="14" fill="#94a3b8" stroke="#475569" strokeWidth="4" />
                            </>
                        )}
                    </motion.g>
                </g>
            )}

            {/* Juggling avocados */}
            {fx.juggle && <Juggle g={g} jug={jug} />}

            {/* The runaway avocado */}
            {fx.runner && (
                <motion.g style={{ x: runner.x, y: runner.y }}>
                    <g transform="translate(0 712)">
                        <Avo g={g} scale={1.9} face={fx.runner === "wink" ? "wink" : "run"} feet />
                    </g>
                </motion.g>
            )}

            {/* Free ball (dribbling, in flight) */}
            {fx.ballFree && (
                <motion.g style={{ x: ball.x, y: ball.y, rotate: ball.r, opacity: ball.o }}>
                    <Avo g={g} scale={1.15} />
                </motion.g>
            )}

            {/* Sparkle burst */}
            <AnimatePresence>
                {fx.sparkle && fx.sparkleAt && (
                    <motion.g key={fx.sparkle} initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.7, delay: 0.25 }}>
                        {Array.from({ length: 8 }, (_, i) => {
                            const a = (i / 8) * Math.PI * 2;
                            return (
                                <motion.path
                                    key={i}
                                    d="M0 -12 L3 -3 L12 0 L3 3 L0 12 L-3 3 L-12 0 L-3 -3 Z"
                                    fill={["#fde047", "#f472b6", "#38bdf8", "#a78bfa"][i % 4]}
                                    initial={{ x: fx.sparkleAt!.x, y: fx.sparkleAt!.y, scale: 0.2 }}
                                    animate={{ x: fx.sparkleAt!.x + Math.cos(a) * 90, y: fx.sparkleAt!.y + Math.sin(a) * 90, scale: [0.2, 1.4, 0.6], rotate: 90 }}
                                    transition={{ duration: 0.7, ease: "easeOut" }}
                                />
                            );
                        })}
                    </motion.g>
                )}
            </AnimatePresence>
        </svg>
    );
}

/** Sunglasses, drawn in the face layer (same units). */
export function Shades({ show }: { show: boolean }) {
    return (
        <AnimatePresence>
            {show && (
                <motion.g key="shades" initial={{ y: -260, opacity: 0, rotate: -8 }} animate={{ y: 0, opacity: 1, rotate: 0 }} exit={{ y: -200, opacity: 0 }} transition={spring(320, 17)}>
                    <path d="M110 298 L140 300 M444 296 L474 292" stroke="#0f172a" strokeWidth="9" strokeLinecap="round" />
                    <rect x="138" y="282" width="112" height="64" rx="26" fill="#0f172a" />
                    <rect x="336" y="280" width="112" height="64" rx="26" fill="#0f172a" />
                    <path d="M250 300 Q293 284 336 300" stroke="#0f172a" strokeWidth="10" fill="none" />
                    <path d="M156 296 L190 296" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" opacity="0.55" />
                    <path d="M354 294 L388 294" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" opacity="0.55" />
                </motion.g>
            )}
        </AnimatePresence>
    );
}

const AVO_SHAPE = "M40 4 C26 4 20 18 18 32 C16 44 6 54 6 70 C6 88 22 98 40 98 C58 98 74 88 74 70 C74 54 64 44 62 32 C60 18 54 4 40 4 Z";

/** The avocado (as on the splash), centred on 0,0; about 80 × 100 units at scale 1, drawn bigger here. */
function Avo({ g, scale = 1, face = "happy", feet = false }: { g: (n: string) => string; scale?: number; face?: "happy" | "wink" | "run"; feet?: boolean }) {
    return (
        <g transform={`scale(${scale * 0.9})`}>
            {feet && (
                <>
                    <motion.ellipse cx="-14" cy="52" rx="11" ry="6" fill="#14532d" animate={{ y: [0, -8, 0] }} transition={{ duration: 0.25, repeat: Infinity }} />
                    <motion.ellipse cx="14" cy="52" rx="11" ry="6" fill="#14532d" animate={{ y: [-8, 0, -8] }} transition={{ duration: 0.25, repeat: Infinity }} />
                </>
            )}
            <g transform="translate(-40 -56)">
                <path d={AVO_SHAPE} fill={`url(#${g("avo-skin")})`} />
                <path d={AVO_SHAPE} transform="translate(40 56) scale(0.84) translate(-40 -56)" fill={`url(#${g("avo-flesh")})`} />
                <circle cx="40" cy="68" r="15" fill={`url(#${g("avo-pit")})`} />
                <ellipse cx="35" cy="62" rx="4.5" ry="3" fill="#ffffff" opacity="0.45" />
                {face === "wink" ? (
                    <>
                        <ellipse cx="32" cy="37" rx="2.6" ry="3.2" fill="#1f2937" />
                        <path d="M44.5 37.5 q3 -3 6 0" stroke="#1f2937" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                    </>
                ) : (
                    <>
                        <ellipse cx="32" cy="37" rx="2.6" ry="3.2" fill="#1f2937" />
                        <ellipse cx="48" cy="37" rx="2.6" ry="3.2" fill="#1f2937" />
                        <circle cx="32.8" cy="36" r="0.9" fill="#ffffff" />
                        <circle cx="48.8" cy="36" r="0.9" fill="#ffffff" />
                    </>
                )}
                <ellipse cx="27" cy="44" rx="3.2" ry="1.8" fill="#fb7185" opacity="0.5" />
                <ellipse cx="53" cy="44" rx="3.2" ry="1.8" fill="#fb7185" opacity="0.5" />
                {face === "run" ? <ellipse cx="40" cy="45.5" rx="2.6" ry="2.2" fill="#7f1d1d" /> : <path d="M35.5 44 q4.5 4 9 0" stroke="#7f1d1d" strokeWidth="1.8" fill="none" strokeLinecap="round" />}
            </g>
        </g>
    );
}

/** Three avocados in a cascade between his hands (right hand tosses high, left passes low). */
function Juggle({ g, jug }: { g: (n: string) => string; jug: MotionValue<number> }) {
    const refs = [useRef<SVGGElement>(null), useRef<SVGGElement>(null), useRef<SVGGElement>(null)];
    useEffect(() => {
        const R = { x: 450, y: 585 };
        const L = { x: 150, y: 600 };
        const update = () => {
            refs.forEach((ref, i) => {
                const p = (((jug.get() + i / 3) % 1) + 1) % 1;
                let x: number, y: number;
                if (p < 0.65) {
                    const q = p / 0.65;
                    x = R.x + (L.x - R.x) * q;
                    y = R.y + (L.y - R.y) * q - 4 * 120 * q * (1 - q);
                } else {
                    const q = (p - 0.65) / 0.35;
                    x = L.x + (R.x - L.x) * q;
                    y = L.y + (R.y - L.y) * q + 4 * 30 * q * (1 - q);
                }
                ref.current?.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(p * 540).toFixed(1)})`);
            });
        };
        update();
        return jug.on("change", update);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jug]);
    return (
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {refs.map((ref, i) => (
                <g key={i} ref={ref}>
                    <Avo g={g} scale={1.25} />
                </g>
            ))}
        </motion.g>
    );
}
