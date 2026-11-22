"use client";

import React from "react";
import { motion } from "framer-motion";

interface FocusCardProps {
  title: string;
  subtitle: string;
  badge?: string;
  meta?: string;
  imageUrl: string;
  accentColor?: string;
  isFocused: boolean;
  onFocus?: () => void;
  onSelect: () => void;
  children?: React.ReactNode;
}

export function FocusCard({
  title,
  subtitle,
  badge,
  meta,
  imageUrl,
  accentColor = "#0A84FF",
  isFocused,
  onFocus,
  onSelect,
  children,
}: FocusCardProps) {
  return (
    <motion.button
      type="button"
      onMouseEnter={onFocus}
      onFocus={onFocus}
      onClick={onSelect}
      animate={{
        scale: isFocused ? 1.055 : 1,
        y: isFocused ? -8 : 0,
      }}
      whileTap={{ scale: 0.985 }}
      transition={{
        type: "spring",
        stiffness: 340,
        damping: 26,
        mass: 0.8,
      }}
      style={{
        boxShadow: isFocused
          ? `0 28px 65px -12px rgba(0, 0, 0, 0.9), 0 0 0 3px rgba(255, 255, 255, 0.9), 0 0 42px ${accentColor}55`
          : "0 14px 32px -10px rgba(0, 0, 0, 0.7)",
      }}
      className="group relative aspect-video w-full overflow-hidden rounded-tvos-lg border border-white/15 bg-tvos-surface text-left focus:outline-none"
    >
      <motion.img
        src={imageUrl}
        alt={title}
        animate={{ scale: isFocused ? 1.08 : 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="h-full w-full object-cover"
      />

      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          background: isFocused
            ? `linear-gradient(180deg, rgba(7,8,12,0.12) 0%, rgba(7,8,12,0.55) 55%, rgba(7,8,12,0.92) 100%)`
            : `linear-gradient(180deg, rgba(7,8,12,0.22) 0%, rgba(7,8,12,0.68) 60%, rgba(7,8,12,0.95) 100%)`,
        }}
      />

      <div className="relative z-10 flex h-full flex-col justify-between p-6">
        <div className="flex items-center justify-between gap-3">
          {badge ? (
            <span className="tvos-glass rounded-full px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-white/90">
              {badge}
            </span>
          ) : (
            <span />
          )}
          {meta ? (
            <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-md">
              {meta}
            </span>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <h3 className="text-2xl font-bold tracking-tight text-white drop-shadow">
            {title}
          </h3>
          <p className="line-clamp-2 text-sm text-white/75">{subtitle}</p>

          <motion.div
            initial={false}
            animate={{
              opacity: isFocused ? 1 : 0,
              y: isFocused ? 0 : 6,
            }}
            transition={{ duration: 0.2 }}
            className="pt-1"
          >
            {children}
          </motion.div>
        </div>
      </div>
    </motion.button>
  );
}
