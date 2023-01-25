import {LabelTypes} from './events'
import {Entry} from './parse'

/**
 * We only want one entry for certain types, not multiple ones for each Ward for one day
 */
const ONE_PER_DAY: LabelTypes[] = ['SZAB', 'TAN', 'PIH']

/**
 *  Determines which entries are considered the same from a calendar entry standpoint
 */
export const filterFunction = (value: Entry, other: Entry): boolean =>
  value.UserId === other.UserId &&
  value.Date === other.Date &&
  value.Type === other.Type &&
  (value.WardId === other.WardId ||
    value.WardId === undefined ||
    other.WardId === undefined ||
    ONE_PER_DAY.includes(value.Type))

/**
 * For ONE_PER_DAY types we set a special WardId so that it's deterministic what remains there after filtering
 */
export const mapFunction = (value: Entry): Entry => {
  if (ONE_PER_DAY.includes(value.Type)) {
    value.WardId = -1
  }
  return value
}
