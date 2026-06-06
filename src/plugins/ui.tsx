/**
 * Small presentational building blocks shared by the React-based OpenMCT
 * plugin views (data-source switcher, uplink panel, …). Kept framework-light
 * and Tailwind-styled so they render correctly inside the shadow roots created
 * by {@link mountReactInShadow}.
 */

/** Uppercase section heading used to title a group of controls. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400 dark:text-gray-500 mb-1.5">
      {children}
    </p>
  )
}

/**
 * Generic action button.
 *
 * @param variant `'primary'` for the accent (blue) style, `'danger'` for
 *   destructive actions (red), `'default'` for the neutral style.
 */
export function ActionButton({
  children,
  onClick,
  disabled,
  variant = 'default',
  title,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'default' | 'primary' | 'danger'
  title?: string
}) {
  const base =
    'rounded px-3 py-1 text-[11px] cursor-pointer border transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const styleByVariant = {
    default:
      'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400',
    primary:
      'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 hover:border-blue-700',
    danger:
      'bg-red-600 text-white border-red-600 hover:bg-red-700 hover:border-red-700',
  }

  return (
    <button
      className={`${base} ${styleByVariant[variant]}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  )
}
