import {LabelTypes} from './events'
import {Entry} from './parse'

/**
 *  Determines which entries are considered the same from a calendar entry standpoint
 *
 *  @param onePerDay We only want one entry for certain types, not multiple ones for each Ward for one day
 */
export const filterFunction =
  (onePerDay: LabelTypes[]) =>
  (value: Entry, other: Entry): boolean =>
    value.UserId === other.UserId &&
    value.Date === other.Date &&
    value.Type === other.Type &&
    (value.WardId === other.WardId ||
      value.WardId === undefined ||
      other.WardId === undefined ||
      onePerDay.includes(value.Type))

/**
 * For onePerDay types we set a special WardId so that it's deterministic what remains there after filtering
 */
export const mapFunction =
  (onePerDay: LabelTypes[]) =>
  (value: Entry): Entry => {
    if (onePerDay.includes(value.Type)) {
      value.WardId = -1
    }
    return value
  }
