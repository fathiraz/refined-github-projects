import { Schema } from 'effect'

export const ExcludeCondition = Schema.Struct({
  fieldId: Schema.String,
  fieldName: Schema.String,
  fieldType: Schema.Literal('SINGLE_SELECT', 'TEXT'),
  optionId: Schema.String,
  optionName: Schema.String,
})
export type ExcludeCondition = Schema.Schema.Type<typeof ExcludeCondition>

export const SprintSettings = Schema.Struct({
  sprintFieldId: Schema.String,
  sprintFieldName: Schema.String,
  doneFieldId: Schema.String,
  doneFieldName: Schema.String,
  doneFieldType: Schema.Literal('SINGLE_SELECT', 'TEXT'),
  doneOptionId: Schema.String,
  doneOptionName: Schema.String,
  acknowledgedSprintId: Schema.optional(Schema.String),
  sprintSnapshotAt: Schema.optional(Schema.String),
  excludeConditions: Schema.optional(Schema.Array(ExcludeCondition)),
  pointsFieldId: Schema.optional(Schema.String),
  pointsFieldName: Schema.optional(Schema.String),
  notStartedOptionId: Schema.optional(Schema.String),
  notStartedOptionName: Schema.optional(Schema.String),
})
export type SprintSettings = Schema.Schema.Type<typeof SprintSettings>

export const AllSprintSettings = Schema.Record({ key: Schema.String, value: SprintSettings })
export type AllSprintSettings = Schema.Schema.Type<typeof AllSprintSettings>
