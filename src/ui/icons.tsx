import React from 'react'
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

export type IconProps = {
  size?: number | string
  color?: string
}

type PrimerOcticonComponent = React.ComponentType<{
  size?: number | 'small' | 'medium' | 'large'
  fill?: string
}>

function Octicon({
  icon: Icon,
  size = 16,
  color = 'currentColor',
}: IconProps & { icon: PrimerOcticonComponent }) {
  if (typeof size === 'string') {
    if (size === 'small' || size === 'medium' || size === 'large') {
      return <Icon size={size} fill={color} />
    }

    const numericSize = Number(size)
    if (Number.isFinite(numericSize)) {
      return <Icon size={numericSize} fill={color} />
    }

    // preserve css-length sizing support from existing IconProps API.
    const iconElement = <Icon size={16} fill="currentColor" />
    return (
      <span style={{ display: 'inline-flex', width: size, height: size, color, lineHeight: 0 }}>
        {React.cloneElement(iconElement as React.ReactElement<any>, {
          style: { width: '100%', height: '100%' },
        })}
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
