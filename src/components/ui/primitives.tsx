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
import {
  AlertIcon as PrimerAlertIcon,
  ArrowSwitchIcon as PrimerArrowSwitchIcon,
  ArrowRightIcon as PrimerArrowRightIcon,
  CalendarIcon as PrimerCalendarIcon,
  CheckCircleIcon as PrimerCheckCircleIcon,
  CheckIcon as PrimerCheckIcon,
  ChevronDownIcon as PrimerChevronDownIcon,
  CircleSlashIcon as PrimerCircleSlashIcon,
  CopyIcon as PrimerCopyIcon,
  DownloadIcon as PrimerDownloadIcon,
  EyeClosedIcon as PrimerEyeClosedIcon,
  EyeIcon as PrimerEyeIcon,
  FilterIcon as PrimerFilterIcon,
  GearIcon as PrimerGearIcon,
  HashIcon as PrimerHashIcon,
  InfoIcon as PrimerInfoIcon,
  IterationsIcon as PrimerIterationsIcon,
  IssueClosedIcon as PrimerIssueClosedIcon,
  IssueReopenedIcon as PrimerIssueReopenedIcon,
  LockIcon as PrimerLockIcon,
  PencilIcon as PrimerPencilIcon,
  PinIcon as PrimerPinIcon,
  PinSlashIcon as PrimerPinSlashIcon,
  PersonIcon as PrimerPersonIcon,
  PlusIcon as PrimerPlusIcon,
  ProjectIcon as PrimerProjectIcon,
  SearchIcon as PrimerSearchIcon,
  ShieldIcon as PrimerShieldIcon,
  SingleSelectIcon as PrimerSingleSelectIcon,
  SlidersIcon as PrimerSlidersIcon,
  StopwatchIcon as PrimerStopwatchIcon,
  SyncIcon as PrimerSyncIcon,
  TasklistIcon as PrimerTasklistIcon,
  TagIcon as PrimerTagIcon,
  TrashIcon as PrimerTrashIcon,
  TypographyIcon as PrimerTypographyIcon,
  XIcon as PrimerXIcon,
} from '@primer/octicons-react'

type IconProps = {
  size?: number | string
  color?: string
}

type PrimerOcticonComponent = React.ComponentType<{ size?: number | 'small' | 'medium' | 'large'; fill?: string }>

function Octicon({ icon: Icon, size = 16, color = 'currentColor' }: IconProps & { icon: PrimerOcticonComponent }) {
  if (typeof size === 'string') {
    if (size === 'small' || size === 'medium' || size === 'large') {
      return <Icon size={size} fill={color} />
    }

    const numericSize = Number(size)
    if (Number.isFinite(numericSize)) {
      return <Icon size={numericSize} fill={color} />
    }

    // Preserve CSS-length sizing support from existing IconProps API.
    const iconElement = <Icon size={16} fill="currentColor" />
    return (
      <span style={{ display: 'inline-flex', width: size, height: size, color, lineHeight: 0 }}>
        {React.cloneElement(iconElement as React.ReactElement<any>, { style: { width: '100%', height: '100%' } })}
      </span>
    )
  }

  return <Icon size={size} fill={color} />
}

export function CheckIcon(props: IconProps) {
  return <Octicon icon={PrimerCheckIcon} {...props} />
}

export function AlertIcon(props: IconProps) {
  return <Octicon icon={PrimerAlertIcon} {...props} />
}

export function InfoIcon(props: IconProps) {
  return <Octicon icon={PrimerInfoIcon} {...props} />
}

export function XIcon(props: IconProps) {
  return <Octicon icon={PrimerXIcon} {...props} />
}

export function GearIcon(props: IconProps) {
  return <Octicon icon={PrimerGearIcon} {...props} />
}

export function FilterIcon(props: IconProps) {
  return <Octicon icon={PrimerFilterIcon} {...props} />
}

export function IterationsIcon(props: IconProps) {
  return <Octicon icon={PrimerIterationsIcon} {...props} />
}

export function SlidersIcon(props: IconProps) {
  return <Octicon icon={PrimerSlidersIcon} {...props} />
}

export function PlusIcon(props: IconProps) {
  return <Octicon icon={PrimerPlusIcon} {...props} />
}

export function TrashIcon(props: IconProps) {
  return <Octicon icon={PrimerTrashIcon} {...props} />
}

export function ChevronDownIcon(props: IconProps) {
  return <Octicon icon={PrimerChevronDownIcon} {...props} />
}

export function CircleCheckIcon(props: IconProps) {
  return <Octicon icon={PrimerCheckCircleIcon} {...props} />
}

export function CircleSlashIcon(props: IconProps) {
  return <Octicon icon={PrimerCircleSlashIcon} {...props} />
}

export function CopyIcon(props: IconProps) {
  return <Octicon icon={PrimerCopyIcon} {...props} />
}

export function SyncIcon(props: IconProps) {
  return <Octicon icon={PrimerSyncIcon} {...props} />
}

export function PersonIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return <Octicon icon={PrimerPersonIcon} size={size} color={color} />
}

export function TagIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return <Octicon icon={PrimerTagIcon} size={size} color={color} />
}

export function ShieldIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return <Octicon icon={PrimerShieldIcon} size={size} color={color} />
}

export function HashIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return <Octicon icon={PrimerHashIcon} size={size} color={color} />
}

export function CalendarIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return <Octicon icon={PrimerCalendarIcon} size={size} color={color} />
}

export function TextLineIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return <Octicon icon={PrimerTypographyIcon} size={size} color={color} />
}

export function IssueClosedIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return <Octicon icon={PrimerIssueClosedIcon} size={size} color={color} />
}

export function IssueReopenedIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return <Octicon icon={PrimerIssueReopenedIcon} size={size} color={color} />
}

export function OptionsSelectIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return <Octicon icon={PrimerSingleSelectIcon} size={size} color={color} />
}

export function ListCheckIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return <Octicon icon={PrimerTasklistIcon} size={size} color={color} />
}

export function ProjectBoardIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return <Octicon icon={PrimerProjectIcon} size={size} color={color} />
}

export function SprintIcon(props: IconProps) {
  return <Octicon icon={PrimerStopwatchIcon} {...props} />
}

export function LockIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return <Octicon icon={PrimerLockIcon} size={size} color={color} />
}

export function PinIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return <Octicon icon={PrimerPinIcon} size={size} color={color} />
}

export function UnpinIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return <Octicon icon={PrimerPinSlashIcon} size={size} color={color} />
}

export function ArrowRightIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return <Octicon icon={PrimerArrowRightIcon} size={size} color={color} />
}

export function DownloadIcon(props: IconProps) {
  return <Octicon icon={PrimerDownloadIcon} {...props} />
}

export function SearchIcon(props: IconProps) {
  return <Octicon icon={PrimerSearchIcon} {...props} />
}

export function PencilIcon(props: IconProps) {
  return <Octicon icon={PrimerPencilIcon} {...props} />
}

export function MoveIcon(props: IconProps) {
  return <Octicon icon={PrimerArrowSwitchIcon} {...props} />
}

export function EyeIcon(props: IconProps) {
  return <Octicon icon={PrimerEyeIcon} {...props} />
}

export function EyeOffIcon(props: IconProps) {
  return <Octicon icon={PrimerEyeClosedIcon} {...props} />
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
