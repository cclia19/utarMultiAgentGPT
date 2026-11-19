"use client";

import { AnimatePresence, motion, useAnimate, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { SCENES, SceneLayer, Shades, runScene, type Face, type Fx, type Held, type SceneCtl, type SceneId } from "./MascotScenes";

/**
 * The UTARCHAT mascot, rigged from one illustration (public/mascot/): a body
 * with the face painted out, plus separate eyes, mouth and sprout layers, so
 * he can blink, glance, wiggle his sprout, hop and change expression. His
 * right arm is its own layer too (the body side behind it is painted in), so
 * he can wave. A shoulder cap hides the joint; the hand waves in front of
 * the edge of his head, kept low enough not to cover his face. His legs are
 * two more layers behind the body, so he can sit on a ledge and swing them.
 * Coordinates are pixels in the 582 × 812 cut-out.
 *
 * crop "full" is the whole figure (with a floor shadow), "bust" a square from
 * the sprout to the chest for avatars. Under "reduce motion" he stays still.
 */

export type MascotMood = "idle" | "happy" | "thinking" | "sheepish";

const W = 582;
const H = 812;
const BUST = 582; // square bust: sprout to chest

const LAYERS = {
    sprout: { x: 270, y: 0, w: 231, h: 112 },
    eyeL: { x: 170, y: 283, w: 47, h: 62 },
    eyeR: { x: 368, y: 281, w: 48, h: 62 },
    mouth: { x: 254, y: 362, w: 87, h: 30 },
    arm: { x: 355, y: 469, w: 102, h: 153 },
    shoulder: { x: 372, y: 473, w: 41, h: 23 },
    legL: { x: 167, y: 655, w: 118, h: 157 },
    legR: { x: 285, y: 655, w: 155, h: 157 },
};
// Each leg pivots at its hip, hidden under the body's pants.
const LEG_ORIGIN = {
    legL: `${((232 - 167) / 118) * 100}% ${((662 - 655) / 157) * 100}%`,
    legR: `${((345 - 285) / 155) * 100}% ${((662 - 655) / 157) * 100}%`,
};
/** Height of his seat (hips) as a share of the figure's height, for placing him on a ledge. */
export const MASCOT_SEAT = 0.77;
// The arm pivots at the shoulder.
const ARM_ORIGIN = `${((395 - 355) / 102) * 100}% ${((471 - 469) / 153) * 100}%`;
// The sprout pivots where its stem meets the head.
const SPROUT_ORIGIN = `${((372 - 270) / 231) * 100}% ${(110 / 112) * 100}%`;

const box = (l: { x: number; y: number; w: number; h: number }) => ({
    left: `${(l.x / W) * 100}%`,
    top: `${(l.y / H) * 100}%`,
    width: `${(l.w / W) * 100}%`,
    height: `${(l.h / H) * 100}%`,
});

const SPRING = { type: "spring", stiffness: 520, damping: 26 } as const;
const INK = "#16161d";

export default function Mascot({
    crop = "full",
    pose = "stand",
    mood = "idle",
    entrance = false,
    hop = 0,
    wave = 0,
    lively = false,
    scenes = false,
    still = false,
    float = crop === "full",
    shadow = crop === "full",
    onClick,
    alt = "",
    className = "",
}: {
    crop?: "full" | "bust";
    /** "sit": on a ledge at MASCOT_SEAT, legs hanging and swinging. */
    pose?: "stand" | "sit";
    mood?: MascotMood;
    /** Drop in, land with a squash and wave hello (once, on mount). */
    entrance?: boolean;
    /** Change this number to make him hop. */
    hop?: number;
    /** Change this number to make him wave. */
    wave?: number;
    /** Now and then, on his own: wave, smile, hop or look around. */
    lively?: boolean;
    /** Little 6-8 s scenes (coffee, reading, basketball, coding, fishing, dance, flip), 5 s apart. */
    scenes?: boolean;
    /** No motion at all (e.g. behind a dialog). */
    still?: boolean;
    float?: boolean;
    /** Floor shadow under his feet (off when he sits on something). */
    shadow?: boolean;
    onClick?: () => void;
    alt?: string;
    className?: string;
}) {
    const reduceMotion = useReducedMotion();
    const reduce = Boolean(reduceMotion || still);
    const [scope, animate] = useAnimate();
    // Driven from code: the arm, a body "actor" (scenes), legs, and scene props.
    const armRot = useMotionValue(0);
    const propTilt = useMotionValue(0);
    const actX = useMotionValue(0);
    const actXPct = useTransform(actX, (v) => `${(v / W) * 100}%`);
    const shadowOpacity = useTransform(actX, (v) => (Math.abs(v) > 60 ? 0 : 1));
    const actY = useMotionValue(0);
    const actYPct = useTransform(actY, (v) => `${v}%`);
    const actRot = useMotionValue(0);
    const actSX = useMotionValue(1);
    const actSY = useMotionValue(1);
    const legKickL = useMotionValue(0);
    const legKickR = useMotionValue(0);
    const ball = { x: useMotionValue(0), y: useMotionValue(0), r: useMotionValue(0), o: useMotionValue(1) };
    const reel = useMotionValue(0);
    const jug = useMotionValue(0);
    const runner = { x: useMotionValue(0), y: useMotionValue(0) };
    const [held, setHeld] = useState<Held>(null);
    const [fx, setFx] = useState<Fx>({});
    const [face, setFace] = useState<Face | null>(null);
    const [inScene, setInScene] = useState(false);
    const [blink, setBlink] = useState(false);
    const [look, setLook] = useState({ x: 0, y: 0 });
    const [greeting, setGreeting] = useState(entrance && !reduce);
    const [beaming, setBeaming] = useState(false);
    const sproutRef = useRef<HTMLImageElement>(null);
    const busy = useRef(false);

    const boing = (amount = 1) => {
        if (sproutRef.current) animate(sproutRef.current, { rotate: [0, -14 * amount, 9 * amount, -4 * amount, 0] }, { duration: 0.8 });
    };

    // Raise the arm, wave a few times with a smile, lower it.
    const doWave = async () => {
        if (reduce || busy.current) return;
        busy.current = true;
        setBeaming(true);
        await animate(armRot, -94, { type: "spring", stiffness: 210, damping: 17 });
        await animate(armRot, [-94, -108, -84, -108, -90], { duration: 1.15, ease: "easeInOut" });
        setBeaming(false);
        await animate(armRot, 0, { type: "spring", stiffness: 170, damping: 19 });
        busy.current = false;
    };

    const doHop = async () => {
        if (reduce || !scope.current) return;
        await animate(scope.current, { scaleX: 1.08, scaleY: 0.9, y: "0%" }, { duration: 0.08 });
        await animate(scope.current, { scaleX: 0.95, scaleY: 1.06, y: "-14%" }, { duration: 0.2, ease: [0.2, 0.8, 0.3, 1] });
        await animate(scope.current, { scaleX: 1, scaleY: 1, y: "0%" }, { duration: 0.22, ease: [0.5, 0, 0.8, 0.4] });
        await animate(scope.current, { scaleX: 1.08, scaleY: 0.92 }, { duration: 0.07 });
        animate(scope.current, { scaleX: 1, scaleY: 1 }, { type: "spring", stiffness: 600, damping: 14 });
        boing();
    };

    // Entrance: drop, squash on landing, spring back, sprout boing.
    useEffect(() => {
        if (!entrance || reduce) return;
        let cancelled = false;
        (async () => {
            await animate(scope.current, { y: "0%", opacity: 1 }, { y: { type: "spring", stiffness: 260, damping: 20, mass: 0.9 }, opacity: { duration: 0.18 } });
            if (cancelled) return;
            await animate(scope.current, { scaleX: 1.1, scaleY: 0.88 }, { duration: 0.09, ease: "easeOut" });
            animate(scope.current, { scaleX: 1, scaleY: 1 }, { type: "spring", stiffness: 600, damping: 12 });
            if (sproutRef.current) animate(sproutRef.current, { rotate: [0, -16, 11, -6, 3, 0] }, { duration: 0.9, ease: "easeOut" });
            await new Promise((r) => setTimeout(r, 250));
            if (cancelled) return;
            await doWave();
            if (!cancelled) setGreeting(false);
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Hop or wave on request.
    useEffect(() => {
        if (hop) doHop();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hop]);
    useEffect(() => {
        if (wave) doWave();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wave]);

    // Lively: every 8-16 s, one small thing (never while thinking or sheepish).
    const moodRef = useRef(mood);
    moodRef.current = mood;
    useEffect(() => {
        if (!lively || reduce) return;
        let t: ReturnType<typeof setTimeout>;
        const loop = (first = false) => {
            t = setTimeout(() => {
                if (moodRef.current === "idle" && !busy.current && document.visibilityState === "visible") {
                    const r = Math.random();
                    if (r < 0.35) doWave();
                    else if (r < 0.7) {
                        setBeaming(true);
                        boing(0.6);
                        setTimeout(() => setBeaming(false), 1500);
                    } else if (r < 0.85) doHop();
                    else {
                        setLook({ x: -3, y: 0 });
                        setTimeout(() => setLook({ x: 3, y: 0 }), 700);
                        setTimeout(() => setLook({ x: 0, y: 0 }), 1500);
                    }
                }
                loop();
            }, (first ? 6000 : 8000) + Math.random() * 8000);
        };
        loop(true);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lively, reduce]);

    // Scenes: one every ~5 s after the last ends, in a shuffled order, only while idle and visible.
    useEffect(() => {
        if (!scenes || reduce) return;
        let run = 0;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
        const reset = () => {
            for (const mv of [armRot, propTilt, actX, actY, actRot, legKickL, legKickR, reel, jug]) mv.stop();
            animate(armRot, 0, { type: "spring", stiffness: 170, damping: 20 });
            actX.set(0);
            for (const mv of [propTilt, actY, actRot, legKickL, legKickR, reel]) animate(mv, 0, { duration: 0.3 });
            animate(actSX, 1, { duration: 0.3 });
            animate(actSY, 1, { duration: 0.3 });
            setHeld(null);
            setFx({});
            setFace(null);
            setInScene(false);
        };
        let queue: SceneId[] = [];
        // Dev only: ?mascotScene=coffee plays that scene every time (for checking the animation).
        const forced = process.env.NODE_ENV !== "production" ? (new URLSearchParams(window.location.search).get("mascotScene") as SceneId | null) : null;
        const next = (): SceneId => {
            if (forced && SCENES.includes(forced)) return forced;
            if (!queue.length) queue = [...SCENES].sort(() => Math.random() - 0.5);
            return queue.shift()!;
        };
        const play = async () => {
            if (stopped) return;
            if (moodRef.current !== "idle" || busy.current || document.visibilityState !== "visible") {
                timer = setTimeout(play, 2000);
                return;
            }
            const id = ++run;
            busy.current = true;
            setInScene(true);
            const ctl: SceneCtl = {
                animate: (mv, to, opts) => new Promise<void>((done) => animate(mv, to as number, opts).then(() => done())),
                arm: armRot,
                tilt: propTilt,
                body: { x: actX, y: actY, rot: actRot, sx: actSX, sy: actSY },
                legL: legKickL,
                legR: legKickR,
                ball,
                reel,
                jug,
                runner,
                setHeld,
                setFace,
                setFx,
                patchFx: (f) => setFx((prev) => ({ ...prev, ...f })),
                boing,
                hop: doHop,
                sleep,
                alive: () => !stopped && run === id,
                screen: () => {
                    const r = (scope.current as HTMLElement).getBoundingClientRect();
                    const perUnit = r.width / W || 1;
                    return { left: -r.left / perUnit, right: (window.innerWidth - r.left) / perUnit };
                },
            };
            try {
                await runScene(next(), ctl);
            } finally {
                busy.current = false;
                if (!stopped) {
                    reset();
                    timer = setTimeout(play, 5000);
                }
            }
        };
        timer = setTimeout(play, 4500);
        return () => {
            stopped = true;
            clearTimeout(timer);
            reset();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scenes, reduce]);

    // Blink every few seconds (sometimes twice), and now and then glance around.
    useEffect(() => {
        if (reduce) return;
        let t: ReturnType<typeof setTimeout>;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const once = (delay: number) => {
            timers.push(setTimeout(() => setBlink(true), delay));
            timers.push(setTimeout(() => setBlink(false), delay + 120));
        };
        const loop = () => {
            t = setTimeout(() => {
                once(0);
                if (Math.random() < 0.25) once(260);
                if (Math.random() < 0.35) {
                    const options = [{ x: -3, y: 0 }, { x: 3, y: 0 }, { x: 2, y: -2 }, { x: -2, y: -2 }];
                    setLook(options[Math.floor(Math.random() * options.length)]);
                    timers.push(setTimeout(() => setLook({ x: 0, y: 0 }), 1400 + Math.random() * 900));
                }
                loop();
            }, 2600 + Math.random() * 3200);
        };
        loop();
        return () => {
            clearTimeout(t);
            timers.forEach(clearTimeout);
        };
    }, [reduce]);

    const shownMood: MascotMood = (greeting || beaming) && (mood === "idle" || mood === "happy") ? "happy" : mood;
    // A scene can set the face directly.
    const eyesKind = face?.eyes ?? (shownMood === "happy" ? "happy" : shownMood === "sheepish" ? "closed" : "open");
    const mouthKind = face?.mouth ?? (shownMood === "happy" ? "open" : shownMood === "sheepish" ? "wobble" : shownMood === "thinking" ? "o" : "default");
    const blush = face ? Boolean(face.blush) : shownMood === "happy" || shownMood === "sheepish";
    const closedEyes = eyesKind !== "open";
    const eyeLook = face?.look ?? (shownMood === "thinking" ? { x: 3, y: -4 } : look);
    const viewH = crop === "bust" ? BUST : H;

    // Idle: a slow float; thinking makes the sprout busier.
    const floating = !reduce && float && pose === "stand" && !inScene;
    const floatAnim = floating ? { y: ["0%", "-2.2%", "0%"] } : { y: "0%" };
    const sproutIdle = reduce
        ? { rotate: 0 }
        : shownMood === "thinking"
          ? { rotate: [-7, 7, -7], transition: { duration: 0.9, repeat: Infinity, ease: "easeInOut" as const } }
          : { rotate: [-3, 3.5, -3], transition: { duration: 3, repeat: Infinity, ease: "easeInOut" as const } };
    const tilt = shownMood === "sheepish" ? -5 : shownMood === "thinking" ? 3 : 0;
    // Sitting, he sways a little from the hips instead of floating.
    const sway = pose === "sit" && !reduce && tilt === 0;

    const figure = (
        <div className="relative w-full" style={{ aspectRatio: `${W} / ${viewH}` }}>
            {shadow && (
                <motion.div aria-hidden className="absolute inset-0" style={{ opacity: shadowOpacity }}>
                <motion.div
                    aria-hidden
                    className="absolute bottom-[-2.5%] left-[19%] h-[5%] w-[62%] rounded-[50%] bg-[radial-gradient(closest-side,rgba(15,23,42,0.28),rgba(15,23,42,0))] dark:bg-[radial-gradient(closest-side,rgba(0,0,0,0.6),rgba(0,0,0,0))]"
                    style={{ x: actXPct }}
                    animate={!reduce && float ? { scaleX: [1, 0.86, 1], opacity: [1, 0.7, 1] } : undefined}
                    transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
                />
                </motion.div>
            )}
            <div className={`absolute inset-0 ${crop === "bust" ? "overflow-hidden" : ""}`}>
                <motion.div
                    className="absolute left-0 top-0 w-full"
                    style={{ aspectRatio: `${W} / ${H}`, originX: 0.5, originY: pose === "sit" ? MASCOT_SEAT : crop === "bust" ? 0.6 : 1 }}
                    animate={{ ...floatAnim, rotate: sway ? [-1.4, 1.4, -1.4] : tilt }}
                    transition={{ y: floating ? { duration: 3.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.4 }, rotate: sway ? { duration: 5.5, repeat: Infinity, ease: "easeInOut" } : SPRING }}
                >
                  <motion.div className="absolute inset-0" style={{ x: actXPct, y: actYPct, rotate: actRot, scaleX: actSX, scaleY: actSY, originX: 0.5, originY: 0.62 }}>
                    {(["legL", "legR"] as const).map((k, n) => (
                        <motion.img
                            key={k}
                            src={`/mascot/${k}.webp`}
                            alt=""
                            draggable={false}
                            className="absolute select-none"
                            style={{ ...box(LAYERS[k]), transformOrigin: LEG_ORIGIN[k], ...(pose === "sit" ? {} : { rotate: n === 0 ? legKickL : legKickR }) }}
                            animate={
                                pose === "sit"
                                    ? reduce
                                        ? { scaleY: 0.86, rotate: 0 }
                                        : { scaleY: 0.86, rotate: n === 0 ? [5, -4, 5] : [-4, 5, -4] }
                                    : { scaleY: 1 }
                            }
                            transition={{ rotate: { duration: n === 0 ? 2.6 : 2.9, repeat: Infinity, ease: "easeInOut" }, scaleY: { duration: 0.3 } }}
                        />
                    ))}
                    <img src="/mascot/base.webp" alt="" draggable={false} className="absolute inset-0 h-full w-full select-none" />
                    {/* Sprout: the wrapper sways, the image boings (on landing and hops). */}
                    <motion.div className="absolute" style={{ ...box(LAYERS.sprout), transformOrigin: SPROUT_ORIGIN }} animate={sproutIdle}>
                        <motion.img
                            ref={sproutRef}
                            src="/mascot/sprout.webp"
                            alt=""
                            draggable={false}
                            className="absolute inset-0 h-full w-full select-none"
                            style={{ transformOrigin: SPROUT_ORIGIN }}
                        />
                    </motion.div>

                    {(["eyeL", "eyeR"] as const).map((k) => (
                        <motion.img
                            key={k}
                            src={`/mascot/${k}.webp`}
                            alt=""
                            draggable={false}
                            className="absolute select-none"
                            style={box(LAYERS[k])}
                            animate={{
                                scaleY: closedEyes ? 0 : blink ? 0.08 : 1,
                                x: `${eyeLook.x * 2.2}%`,
                                y: `${eyeLook.y * 1.6}%`,
                            }}
                            transition={{ scaleY: { duration: blink ? 0.06 : 0.1 }, x: SPRING, y: SPRING }}
                        />
                    ))}
                    <motion.img
                        src="/mascot/mouth.webp"
                        alt=""
                        draggable={false}
                        className="absolute select-none"
                        style={box(LAYERS.mouth)}
                        animate={{ opacity: mouthKind === "default" ? 1 : 0, scale: mouthKind === "default" ? 1 : 0.7 }}
                        transition={{ duration: 0.15 }}
                    />

                    {/* Expressions drawn over the face */}
                    <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                        <AnimatePresence>
                            {closedEyes && (
                                <motion.g key="smile-eyes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                                    {eyesKind === "happy" ? (
                                        <>
                                            <path d="M174 322 Q193 292 212 322" fill="none" stroke={INK} strokeWidth="8" strokeLinecap="round" />
                                            <path d="M372 320 Q391 290 410 320" fill="none" stroke={INK} strokeWidth="8" strokeLinecap="round" />
                                        </>
                                    ) : (
                                        <>
                                            <path d="M176 312 Q193 330 210 312" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
                                            <path d="M374 310 Q391 328 408 310" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
                                        </>
                                    )}
                                </motion.g>
                            )}
                            {blush && (
                                <motion.g key="blush" initial={{ opacity: 0 }} animate={{ opacity: shownMood === "sheepish" ? 0.55 : 0.4 }} exit={{ opacity: 0 }}>
                                    <ellipse cx="148" cy="368" rx="30" ry="15" fill="#ff7a8a" filter="url(#mascot-blur)" />
                                    <ellipse cx="438" cy="366" rx="30" ry="15" fill="#ff7a8a" filter="url(#mascot-blur)" />
                                </motion.g>
                            )}
                            {mouthKind === "open" && (
                                <motion.g key="open-smile" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} style={{ transformOrigin: "297px 372px" }} transition={SPRING}>
                                    <path d="M262 364 Q297 366 332 364 Q326 404 297 404 Q268 404 262 364 Z" fill="#3b1518" />
                                    <path d="M276 392 Q297 380 318 392 Q310 404 297 404 Q284 404 276 392 Z" fill="#f2737f" />
                                </motion.g>
                            )}
                            {mouthKind === "wobble" && (
                                <motion.path key="wobble" d="M268 378 Q282 370 297 378 T326 376" fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} />
                            )}
                            {mouthKind === "smirk" && (
                                <motion.path key="smirk" d="M270 376 Q300 392 330 368" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />
                            )}
                            {mouthKind === "o" && (
                                <motion.ellipse key="hmm" cx="304" cy="378" rx="10" ry="8" fill="#3b1518" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} style={{ transformOrigin: "304px 378px" }} transition={SPRING} />
                            )}
                        </AnimatePresence>
                        <Shades show={Boolean(face?.shades)} />
                        <defs>
                            <filter id="mascot-blur" x="-50%" y="-50%" width="200%" height="200%">
                                <feGaussianBlur stdDeviation="7" />
                            </filter>
                        </defs>
                    </svg>
                    {/* The arm comes last: a raised hand is in front of his face */}
                    <motion.img
                        src="/mascot/arm.webp"
                        alt=""
                        draggable={false}
                        className="absolute select-none"
                        style={{ ...box(LAYERS.arm), transformOrigin: ARM_ORIGIN, rotate: armRot }}
                    />
                    <img src="/mascot/shoulder.webp" alt="" draggable={false} className="absolute select-none" style={box(LAYERS.shoulder)} />
                  </motion.div>
                </motion.div>
            </div>
            {scenes && crop === "full" && <SceneLayer held={held} fx={fx} arm={armRot} tilt={propTilt} ball={ball} reel={reel} jug={jug} runner={runner} bodyX={actX} />}
        </div>
    );

    return (
        <motion.div
            ref={scope}
            role={alt ? "img" : undefined}
            aria-label={alt || undefined}
            aria-hidden={alt ? undefined : true}
            onClick={onClick}
            initial={entrance && !reduce ? { y: "-38%", opacity: 0, scaleX: 0.92, scaleY: 1.08 } : false}
            whileHover={onClick && !reduce ? { scale: 1.03 } : undefined}
            className={`relative ${onClick ? "cursor-pointer" : ""} ${className}`}
            style={{ originX: 0.5, originY: 1 }}
        >
            {figure}
        </motion.div>
    );
}
