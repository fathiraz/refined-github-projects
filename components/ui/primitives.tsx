import React from 'react'
import {
  BaseStyles,
  Box,
  Button,
  type ButtonProps,
  Flash,
  Heading,
  Spinner,
  Text,
  ThemeProvider,
} from '@primer/react'

type IconProps = {
  size?: number
  color?: string
}

function SvgIcon({ size = 16, color = 'currentColor', children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M3 8.5 6.25 11.5 13 4.5" />
    </SvgIcon>
  )
}

export function AlertIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M8 2.5 14 13H2L8 2.5Z" />
      <path d="M8 6v3" />
      <circle cx="8" cy="11.1" r="0.6" fill={props.color || 'currentColor'} stroke="none" />
    </SvgIcon>
  )
}

export function InfoIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 7.25v3" />
      <circle cx="8" cy="5" r="0.6" fill={props.color || 'currentColor'} stroke="none" />
    </SvgIcon>
  )
}

export function XIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m4.5 4.5 7 7" />
      <path d="m11.5 4.5-7 7" />
    </SvgIcon>
  )
}

export function GearIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="8" cy="8" r="2.1" />
      <path d="M8 2.5v1.3M8 12.2v1.3M13.5 8h-1.3M3.8 8H2.5M11.9 4.1l-.9.9M5 11l-.9.9M11.9 11.9l-.9-.9M5 5l-.9-.9" />
    </SvgIcon>
  )
}

export function SlidersIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M2.5 4h11" />
      <circle cx="5.5" cy="4" r="1.5" />
      <path d="M2.5 8h11" />
      <circle cx="10.5" cy="8" r="1.5" />
      <path d="M2.5 12h11" />
      <circle cx="7" cy="12" r="1.5" />
    </SvgIcon>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M8 3.25v9.5M3.25 8h9.5" />
    </SvgIcon>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M3.75 4.5h8.5" />
      <path d="M6 4.5v-1h4v1" />
      <path d="M5 6.25v5.5M8 6.25v5.5M11 6.25v5.5" />
      <path d="M4.75 4.5l.5 8.25h5.5l.5-8.25" />
    </SvgIcon>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M3.5 6 8 10.5 12.5 6" />
    </SvgIcon>
  )
}

export function CircleCheckIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M5.5 8.25 7.25 10 10.5 6" />
    </SvgIcon>
  )
}

export function CircleSlashIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M4.5 4.5 11.5 11.5" />
    </SvgIcon>
  )
}

export function CopyIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="5.5" y="2.5" width="7" height="8" rx="1.5" />
      <path d="M3.5 5v6.5c0 .8.7 1.5 1.5 1.5h5" />
    </SvgIcon>
  )
}

export function SyncIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12.5 5.25V2.75h-2.5" />
      <path d="M3.75 7A4.75 4.75 0 0 1 12.5 5.25" />
      <path d="M3.5 10.75v2.5H6" />
      <path d="M12.25 9A4.75 4.75 0 0 1 3.5 10.75" />
    </SvgIcon>
  )
}

export function PersonIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M2.5 13.5c0-2.5 2.5-4 5.5-4s5.5 1.5 5.5 4" />
    </svg>
  )
}

export function TagIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 2.75h5.25l5.5 5.5-5.25 5.25-5.5-5.5V2.75Z" />
      <circle cx="5.5" cy="5.5" r="0.75" fill={color} stroke="none" />
    </svg>
  )
}

export function ShieldIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2 L13.5 4.5v4C13.5 11.5 11 13.5 8 14 5 13.5 2.5 11.5 2.5 8.5v-4L8 2Z" />
      <path d="M6 8.5h4M8 7v3" />
    </svg>
  )
}

export function HashIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5.5 2.5 4 13.5M12 2.5 10.5 13.5" />
      <path d="M3 6.5h10M2.5 9.5h10" />
    </svg>
  )
}

export function CalendarIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M2.5 7h11" />
      <path d="M5.5 2v3M10.5 2v3" />
      <rect x="5" y="8.75" width="2" height="2" rx="0.5" fill={color} stroke="none" />
    </svg>
  )
}

export function TextLineIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4H8M8 4h5.5M8 4v8" />
      <path d="M5.5 12h5" />
    </svg>
  )
}

export function OptionsSelectIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" />
      <path d="M5 8l2 2 4-4" />
    </svg>
  )
}

export function ListCheckIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4.5h7.5" />
      <path d="M2.5 8h5.5" />
      <path d="M2.5 11.5h4.5" />
      <path d="M11 8.5l1.5 1.5 2.5-2.5" />
    </svg>
  )
}

export function ProjectBoardIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M6 2.5v11" />
      <path d="M2.5 6.5h3.5M2.5 10h3.5" />
    </svg>
  )
}

export function SprintIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 8A5.5 5.5 0 1 1 8 13.5" />
      <path d="M2.5 8V5.5H5" />
      <path d="M8 5.5v3l2 1.25" />
    </svg>
  )
}

export function LockIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={color} aria-hidden="true">
      <path d="M4 7V5a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 8.5v5A1.5 1.5 0 0 1 12.5 15h-9A1.5 1.5 0 0 1 2 13.5v-5A1.5 1.5 0 0 1 3.5 7H4Zm1.5 0h5V5a2.5 2.5 0 0 0-5 0v2Zm-2 1a.5.5 0 0 0-.5.5v5a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-5a.5.5 0 0 0-.5-.5h-9Z"/>
    </svg>
  )
}

export function PinIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={color} aria-hidden="true">
      <path d="m9.585.52.929.928-.797.797.64 1.95a3.508 3.508 0 0 1-.17 2.6l-.474.948-2.152 2.152-.624-.624a.5.5 0 0 0-.707 0L3.5 12.5l-.354.354-.707-.707.354-.354 3.123-3.123a.5.5 0 0 0 0-.707l-.624-.624L7.444 5.187l.948-.474a3.508 3.508 0 0 1 2.6-.17l1.95.64.797-.797.928.929L9.585.52Z"/>
    </svg>
  )
}

export function UnpinIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={color} aria-hidden="true">
      <path d="M7.28.22a.749.749 0 0 1 1.06 0l1.94 1.94L11.5 3.44a.749.749 0 0 1 0 1.06l-.793.793 1.646 1.646a.749.749 0 0 1 0 1.06l-.757.758a3.001 3.001 0 0 1-2.888.777L5.38 11.51a3 3 0 0 1 .284 2.642l-.007.019a1.742 1.742 0 0 1-1.103 1.078.75.75 0 0 1-.948-.948 1.742 1.742 0 0 1 1.078-1.103l.019-.007a1.5 1.5 0 0 0 .942-1.414 1.502 1.502 0 0 0-.278-1.085L3.561 9.503a3.001 3.001 0 0 1 .777-2.888L5.096 5.856 3.22 3.28a.749.749 0 0 1 1.06-1.06l4 3.999zm.838 3.004L9.56 4.666 7.76 6.466a1.5 1.5 0 0 0-.388 1.444l.354.354a1.5 1.5 0 0 0 1.444-.388l1.8-1.8zM.47 15.53a.749.749 0 1 0 1.06-1.06l-1.53-1.53A.749.749 0 1 0 0 14L.47 15.53z" />
    </svg>
  )
}

export function ArrowRightIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={color} aria-hidden="true">
      <path d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.042-1.06l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.44L8.22 4.03a.75.75 0 0 1 0-1.06Z"/>
    </svg>
  )
}

export function DownloadIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M8 2v8M5 7l3 3 3-3" />
      <path d="M2.5 12h11" />
    </SvgIcon>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="6.5" cy="6.5" r="4" />
      <path d="M9.5 9.5 13 13" />
    </SvgIcon>
  )
}

export function PencilIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M11.5 2.5 13.5 4.5 5.5 12.5H3.5v-2L11.5 2.5Z" />
      <path d="M9.5 4.5l2 2" />
    </SvgIcon>
  )
}

export function MoveIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M8 1v14M8 1l-3 3M8 1l3 3M8 15l-3-3M8 15l3-3" />
    </SvgIcon>
  )
}

interface KeyboardHintProps {
  shortcuts: Array<{ key: string; label?: string }>
}

export function KeyboardHint({ shortcuts }: KeyboardHintProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
      {shortcuts.map(({ key, label }) => (
        <Box key={key} sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <Box
            as="kbd"
            sx={{
              fontSize: 0, fontFamily: 'inherit', fontWeight: 500,
              px: 1, py: '1px', borderRadius: 1,
              bg: 'canvas.inset', border: '1px solid', borderColor: 'border.default',
              color: 'fg.muted', cursor: 'default', lineHeight: 1.6,
            }}
          >
            {key}
          </Box>
          {label && (
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{label}</Text>
          )}
        </Box>
      ))}
    </Box>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider colorMode="auto">
      <BaseStyles>
        <Box
          sx={{
            color: 'fg.default',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            lineHeight: 1.5,
          }}
        >
          {children}
        </Box>
      </BaseStyles>
    </ThemeProvider>
  )
}

interface PanelCardProps {
  children: React.ReactNode
  variant?: 'default' | 'elevated' | 'inset'
  padding?: 'none' | 'small' | 'medium' | 'large'
  className?: string
}

export function PanelCard({ children, variant = 'default', padding = 'medium', className }: PanelCardProps) {
  const paddingMap = { none: 0, small: 3, medium: 4, large: 5 }
  const variantStyles = {
    default: { bg: 'canvas.default', borderColor: 'border.default', borderWidth: 1, borderStyle: 'solid' },
    elevated: { bg: 'canvas.overlay', borderColor: 'border.default', borderWidth: 1, borderStyle: 'solid' },
    inset: { bg: 'canvas.inset', borderColor: 'border.default', borderWidth: 1, borderStyle: 'solid' },
  }

  return (
    <Box
      className={className}
      sx={{
        borderRadius: 2,
        p: paddingMap[padding],
        transition: 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)',
        ...variantStyles[variant],
      }}
    >
      {children}
    </Box>
  )
}

interface SectionHeaderProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
  icon?: React.ReactNode
}

export function SectionHeader({ title, subtitle, action, icon }: SectionHeaderProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 3, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3, minWidth: 0 }}>
        {icon && (
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              bg: 'accent.subtle',
              color: 'accent.fg',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Heading as="h2" sx={{ fontSize: 4, fontWeight: 'bold', m: 0 }}>
            {title}
          </Heading>
          {subtitle && (
            <Text as="p" sx={{ m: 0, mt: 1, color: 'fg.muted', fontSize: 1 }}>
              {subtitle}
            </Text>
          )}
        </Box>
      </Box>
      {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
    </Box>
  )
}

interface ActionButtonProps extends Omit<ButtonProps, 'variant' | 'icon'> {
  loading?: boolean
  icon?: React.ReactNode
}

function buttonSx(extra?: ButtonProps['sx']) {
  return {
    boxShadow: 'none',
    transition: 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover:not([disabled])': { transform: 'translateY(-1px)' },
    '&:active:not([disabled])': { transform: 'translateY(0)' },
    ...(extra || {}),
  }
}

export function PrimaryAction({ children, loading, icon, ...props }: ActionButtonProps) {
  return (
    <Button variant="primary" {...props} sx={buttonSx(props.sx)}>
      {loading ? <Spinner size="small" /> : <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>{icon}{children}</Box>}
    </Button>
  )
}

export function SecondaryAction({ children, icon, ...props }: ActionButtonProps) {
  return (
    <Button variant="default" {...props} sx={buttonSx(props.sx)}>
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>{icon}{children}</Box>
    </Button>
  )
}

export function GhostAction({ children, icon, ...props }: ActionButtonProps) {
  return (
    <Button variant="invisible" {...props} sx={buttonSx(props.sx)}>
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>{icon}{children}</Box>
    </Button>
  )
}

interface StatusBannerProps {
  variant: 'success' | 'warning' | 'error' | 'info'
  title?: string
  children: React.ReactNode
  onDismiss?: () => void
}

const statusIcons = {
  success: CheckIcon,
  warning: AlertIcon,
  error: XIcon,
  info: InfoIcon,
}

const statusFlashVariants = {
  success: 'success' as const,
  warning: 'warning' as const,
  error: 'danger' as const,
  info: 'default' as const,
}

const statusColors = {
  success: 'success.fg',
  warning: 'attention.fg',
  error: 'danger.fg',
  info: 'accent.fg',
} as const

export function StatusBanner({ variant, title, children, onDismiss }: StatusBannerProps) {
  const Icon = statusIcons[variant]

  return (
    <Flash
      variant={statusFlashVariants[variant]}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 3,
        p: 3,
        borderRadius: 2,
        animation: 'fadeSlideIn 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        '@keyframes fadeSlideIn': {
          from: { opacity: 0, transform: 'translateY(-8px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      }}
    >
      <Box sx={{ mt: '2px', flexShrink: 0, color: statusColors[variant] }}>
        <Icon size={16} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {title && <Text as="p" sx={{ fontWeight: 'semibold', m: 0, mb: 1 }}>{title}</Text>}
        <Text as="p" sx={{ m: 0, fontSize: 1 }}>{children}</Text>
      </Box>
      {onDismiss && <GhostAction onClick={onDismiss} icon={<XIcon size={14} />} aria-label="Dismiss" />}
    </Flash>
  )
}

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', py: 6, px: 4, gap: 3 }}>
      {icon && (
        <Box sx={{ width: 48, height: 48, borderRadius: 2, bg: 'canvas.subtle', color: 'fg.muted', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </Box>
      )}
      <Box>
        <Heading sx={{ fontSize: 4, fontWeight: 'bold', m: 0, mb: description ? 2 : 0 }}>{title}</Heading>
        {description && <Text as="p" sx={{ color: 'fg.muted', m: 0, maxWidth: 420 }}>{description}</Text>}
      </Box>
      {action && <Box>{action}</Box>}
    </Box>
  )
}

interface ProgressStateProps {
  progress: number
  status?: 'idle' | 'running' | 'paused' | 'complete' | 'error'
  label?: string
  sublabel?: string
}

export function ProgressState({ progress, status = 'idle', label, sublabel }: ProgressStateProps) {
  const isComplete = status === 'complete'
  const isError = status === 'error'
  const isPaused = status === 'paused'

  const progressColor = isError
    ? 'danger.emphasis'
    : isComplete
      ? 'success.emphasis'
      : isPaused
        ? 'attention.emphasis'
        : 'accent.emphasis'

  const title = label || (isComplete ? 'Complete' : isError ? 'Error' : isPaused ? 'Paused' : 'In progress')

  return (
    <PanelCard variant="elevated" padding="medium">
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bg: progressColor,
                animation: status === 'running' ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : undefined,
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                  '50%': { opacity: 0.6, transform: 'scale(1.1)' },
                },
              }}
            />
            <Text sx={{ fontWeight: 'semibold', fontSize: 2 }}>{title}</Text>
          </Box>
          <Text sx={{ fontWeight: 'semibold', color: 'fg.muted', fontSize: 2 }}>{Math.round(progress)}%</Text>
        </Box>

        <Box sx={{ height: 8, borderRadius: 2, bg: 'canvas.subtle', overflow: 'hidden' }}>
          <Box sx={{ height: '100%', width: `${progress}%`, bg: progressColor, borderRadius: 2, transition: 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)' }} />
        </Box>

        {sublabel && <Text sx={{ fontSize: 1, color: 'fg.muted', m: 0 }}>{sublabel}</Text>}
      </Box>
    </PanelCard>
  )
}

interface StepIndicatorProps {
  current: number  // 1-based
  total: number
}

export function StepIndicator({ current, total }: StepIndicatorProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {Array.from({ length: total }, (_, i) => (
        <Box
          key={i}
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bg: i < current ? 'accent.emphasis' : 'border.default',
            transition: 'background-color 200ms cubic-bezier(0.4, 0, 0.2, 1)',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        />
      ))}
    </Box>
  )
}
