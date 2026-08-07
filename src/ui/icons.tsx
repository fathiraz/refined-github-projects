import React from 'react'
import {
  AlertIcon as PrimerAlertIcon,
  ArrowRightIcon as PrimerArrowRightIcon,
  ArrowSwitchIcon as PrimerArrowSwitchIcon,
  CalendarIcon as PrimerCalendarIcon,
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
  IssueClosedIcon as PrimerIssueClosedIcon,
  IssueReopenedIcon as PrimerIssueReopenedIcon,
  IterationsIcon as PrimerIterationsIcon,
  LockIcon as PrimerLockIcon,
  PencilIcon as PrimerPencilIcon,
  PersonIcon as PrimerPersonIcon,
  PinIcon as PrimerPinIcon,
  PlusIcon as PrimerPlusIcon,
  ProjectIcon as PrimerProjectIcon,
  SearchIcon as PrimerSearchIcon,
  ShieldIcon as PrimerShieldIcon,
  SingleSelectIcon as PrimerSingleSelectIcon,
  SlidersIcon as PrimerSlidersIcon,
  StopwatchIcon as PrimerStopwatchIcon,
  SyncIcon as PrimerSyncIcon,
  TagIcon as PrimerTagIcon,
  TasklistIcon as PrimerTasklistIcon,
  TrashIcon as PrimerTrashIcon,
  TypographyIcon as PrimerTypographyIcon,
  XIcon as PrimerXIcon,
} from '@primer/octicons-react'

/**
 * Thin adapters over `@primer/octicons-react`. They exist only to translate
 * this codebase's `{ size, color }` convention onto the octicon's
 * `{ size, fill }` props — the glyphs themselves come from the package.
 */
type OcticonSize = number | 'small' | 'medium' | 'large'

export type IconProps = {
  size?: OcticonSize
  color?: string
  children?: React.ReactNode
}

type Octicon = React.ComponentType<{ size?: OcticonSize; fill?: string }>

const icon =
  (Glyph: Octicon) =>
  ({ size = 16, color = 'currentColor' }: IconProps) => <Glyph size={size} fill={color} />

export const AlertIcon = icon(PrimerAlertIcon)
export const ArrowRightIcon = icon(PrimerArrowRightIcon)
export const CalendarIcon = icon(PrimerCalendarIcon)
export const CheckIcon = icon(PrimerCheckIcon)
export const ChevronDownIcon = icon(PrimerChevronDownIcon)
export const CircleSlashIcon = icon(PrimerCircleSlashIcon)
export const CopyIcon = icon(PrimerCopyIcon)
export const DownloadIcon = icon(PrimerDownloadIcon)
export const EyeIcon = icon(PrimerEyeIcon)
export const EyeOffIcon = icon(PrimerEyeClosedIcon)
export const FilterIcon = icon(PrimerFilterIcon)
export const GearIcon = icon(PrimerGearIcon)
export const HashIcon = icon(PrimerHashIcon)
export const InfoIcon = icon(PrimerInfoIcon)
export const IssueClosedIcon = icon(PrimerIssueClosedIcon)
export const IssueReopenedIcon = icon(PrimerIssueReopenedIcon)
export const IterationsIcon = icon(PrimerIterationsIcon)
export const ListCheckIcon = icon(PrimerTasklistIcon)
export const LockIcon = icon(PrimerLockIcon)
export const MoveIcon = icon(PrimerArrowSwitchIcon)
export const OptionsSelectIcon = icon(PrimerSingleSelectIcon)
export const PencilIcon = icon(PrimerPencilIcon)
export const PersonIcon = icon(PrimerPersonIcon)
export const PinIcon = icon(PrimerPinIcon)
export const PlusIcon = icon(PrimerPlusIcon)
export const ProjectBoardIcon = icon(PrimerProjectIcon)
export const SearchIcon = icon(PrimerSearchIcon)
export const ShieldIcon = icon(PrimerShieldIcon)
export const SlidersIcon = icon(PrimerSlidersIcon)
export const SprintIcon = icon(PrimerStopwatchIcon)
export const SyncIcon = icon(PrimerSyncIcon)
export const TagIcon = icon(PrimerTagIcon)
export const TextLineIcon = icon(PrimerTypographyIcon)
export const TrashIcon = icon(PrimerTrashIcon)
export const XIcon = icon(PrimerXIcon)
