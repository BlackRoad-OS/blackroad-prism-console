import { useEffect, useState } from "react";

/**
 * A reflection component that displays prompts with text areas for answers.
 * Answers are persisted in localStorage for later retrieval.
 * @param {Object} props - Component props
 * @param {string} props.title - Title for the reflection section
 * @param {string} props.storageKey - localStorage key for persisting answers
 * @param {Array<string>} props.prompts - Array of prompt questions to display
 * @returns {JSX.Element} The active reflection component
 */
export default function ActiveReflection({ title, storageKey, prompts }) {
  const [answers, setAnswers] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        return JSON.parse(localStorage.getItem(storageKey)) || prompts.map(() => "");
      } catch {
        return prompts.map(() => "");
      }
    }
    return prompts.map(() => "");
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, JSON.stringify(answers));
    }
  }, [answers, storageKey]);

  const update = (i, val) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[i] = val;
      return next;
    });
  };

  return (
    <section className="p-3 rounded-lg bg-white/5 border border-white/10">
      <h3 className="font-semibold mb-2">{title}</h3>
      {prompts.map((p, i) => (
        <div key={i} className="mb-2">
          <p className="text-sm opacity-80">{p}</p>
          <textarea
            className="mt-1 w-full text-sm p-1 rounded bg-white/5 border border-white/10"
            rows={3}
            value={answers[i] || ""}
            onChange={(e) => update(i, e.target.value)}
          />
        </div>
      ))}
    </section>
  );
}
