"use client";

import { AnimatePresence, motion, useAnimate, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * The UTARCHAT mascot, rigged from one illustration (public/mascot/): a body
 * with the face painted out, plus separate eyes, mouth and sprout layers, so
 * he can blink, glance, wiggle his sprout, hop and change expression.
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
};
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
    mood = "idle",
    entrance = false,
    hop = 0,
    float = crop === "full",
    onClick,
    alt = "",
    className = "",
}: {
    crop?: "full" | "bust";
    mood?: MascotMood;
    /** Drop in, land with a squash and wave hello (once, on mount). */
    entrance?: boolean;
    /** Change this number to make him hop. */
    hop?: number;
    float?: boolean;
    onClick?: () => void;
    alt?: string;
    className?: string;
}) {
    const reduce = useReducedMotion();
    const [scope, animate] = useAnimate();
    const [blink, setBlink] = useState(false);
    const [look, setLook] = useState({ x: 0, y: 0 });
    const [greeting, setGreeting] = useState(entrance && !reduce);
    const sproutRef = useRef<HTMLImageElement>(null);

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
            setTimeout(() => !cancelled && setGreeting(false), 1500);
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Hop on request: crouch, jump, land with a squash.
    useEffect(() => {
        if (!hop || reduce || !scope.current) return;
        (async () => {
            await animate(scope.current, { scaleX: 1.08, scaleY: 0.9, y: "0%" }, { duration: 0.08 });
            await animate(scope.current, { scaleX: 0.95, scaleY: 1.06, y: "-14%" }, { duration: 0.2, ease: [0.2, 0.8, 0.3, 1] });
            await animate(scope.current, { scaleX: 1, scaleY: 1, y: "0%" }, { duration: 0.22, ease: [0.5, 0, 0.8, 0.4] });
            await animate(scope.current, { scaleX: 1.08, scaleY: 0.92 }, { duration: 0.07 });
            animate(scope.current, { scaleX: 1, scaleY: 1 }, { type: "spring", stiffness: 600, damping: 14 });
            if (sproutRef.current) animate(sproutRef.current, { rotate: [0, -14, 9, -4, 0] }, { duration: 0.8 });
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hop]);

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

    const shownMood: MascotMood = greeting ? "happy" : mood;
    const closedEyes = shownMood === "happy" || shownMood === "sheepish";
    const eyeLook = shownMood === "thinking" ? { x: 3, y: -4 } : look;
    const viewH = crop === "bust" ? BUST : H;

    // Idle: a slow float; thinking makes the sprout busier.
    const floatAnim = !reduce && float ? { y: ["0%", "-2.2%", "0%"] } : { y: "0%" };
    const sproutIdle = reduce
        ? { rotate: 0 }
        : shownMood === "thinking"
          ? { rotate: [-7, 7, -7], transition: { duration: 0.9, repeat: Infinity, ease: "easeInOut" as const } }
          : { rotate: [-3, 3.5, -3], transition: { duration: 3, repeat: Infinity, ease: "easeInOut" as const } };
    const tilt = shownMood === "sheepish" ? -5 : shownMood === "thinking" ? 3 : 0;

    const figure = (
        <div className="relative w-full" style={{ aspectRatio: `${W} / ${viewH}` }}>
            {crop === "full" && (
                <motion.div
                    aria-hidden
                    className="absolute bottom-[-2.5%] left-1/2 h-[5%] w-[62%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(15,23,42,0.28),rgba(15,23,42,0))] dark:bg-[radial-gradient(closest-side,rgba(0,0,0,0.6),rgba(0,0,0,0))]"
                    animate={!reduce && float ? { scaleX: [1, 0.86, 1], opacity: [1, 0.7, 1] } : undefined}
                    transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
                />
            )}
            <div className={`absolute inset-0 ${crop === "bust" ? "overflow-hidden" : ""}`}>
                <motion.div
                    className="absolute left-0 top-0 w-full"
                    style={{ aspectRatio: `${W} / ${H}`, originX: 0.5, originY: crop === "bust" ? 0.6 : 1 }}
                    animate={{ ...floatAnim, rotate: tilt }}
                    transition={{ y: { duration: 3.4, repeat: Infinity, ease: "easeInOut" }, rotate: SPRING }}
                >
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
                        animate={{ opacity: shownMood === "idle" ? 1 : 0, scale: shownMood === "idle" ? 1 : 0.7 }}
                        transition={{ duration: 0.15 }}
                    />

                    {/* Expressions drawn over the face */}
                    <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                        <AnimatePresence>
                            {closedEyes && (
                                <motion.g key="smile-eyes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                                    {shownMood === "happy" ? (
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
                            {(shownMood === "happy" || shownMood === "sheepish") && (
                                <motion.g key="blush" initial={{ opacity: 0 }} animate={{ opacity: shownMood === "sheepish" ? 0.55 : 0.4 }} exit={{ opacity: 0 }}>
                                    <ellipse cx="148" cy="368" rx="30" ry="15" fill="#ff7a8a" filter="url(#mascot-blur)" />
                                    <ellipse cx="438" cy="366" rx="30" ry="15" fill="#ff7a8a" filter="url(#mascot-blur)" />
                                </motion.g>
                            )}
                            {shownMood === "happy" && (
                                <motion.g key="open-smile" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} style={{ transformOrigin: "297px 372px" }} transition={SPRING}>
                                    <path d="M262 364 Q297 366 332 364 Q326 404 297 404 Q268 404 262 364 Z" fill="#3b1518" />
                                    <path d="M276 392 Q297 380 318 392 Q310 404 297 404 Q284 404 276 392 Z" fill="#f2737f" />
                                </motion.g>
                            )}
                            {shownMood === "sheepish" && (
                                <motion.path key="wobble" d="M268 378 Q282 370 297 378 T326 376" fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} />
                            )}
                            {shownMood === "thinking" && (
                                <motion.ellipse key="hmm" cx="304" cy="378" rx="10" ry="8" fill="#3b1518" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} style={{ transformOrigin: "304px 378px" }} transition={SPRING} />
                            )}
                        </AnimatePresence>
                        <defs>
                            <filter id="mascot-blur" x="-50%" y="-50%" width="200%" height="200%">
                                <feGaussianBlur stdDeviation="7" />
                            </filter>
                        </defs>
                    </svg>
                </motion.div>
            </div>
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
