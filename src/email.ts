import _ from 'lodash'
import {Diff} from './calendar'
import Email from 'email-templates'
import {CalendarEvent} from './events'
import {users} from './users'

const email = new Email({
  message: {
    from: `Meditime Értesítő <${process.env.SENDER_EMAIL}>`,
  },
  transport: {
    service: 'gmail',
    auth: {
      user: process.env.SENDER_EMAIL,
      pass: process.env.SENDER_PW,
    },
  },
  send: true,
})

const eventFormat = ({start, end, ...eventProps}: CalendarEvent) => {
  const startDate = new Date((start.date || start.dateTime) as string)
  const endDate = new Date((end.date || end.dateTime) as string)

  if (start.date) endDate.setDate(endDate.getDate() - 1)

  return {
    timeString:
      (start.date && startDate.getTime() === endDate.getTime()) ||
      start.dateTime
        ? `${startDate.toLocaleString('hu-HU', {
            month: 'short',
            day: '2-digit',
            weekday: 'short',
          })}`
        : `${startDate
            .toLocaleString('hu-HU', {
              month: 'short',
              day: '2-digit',
            })
            .replace(/.$/, '')}-${endDate.toLocaleString('hu-HU', {
            ...(startDate.getMonth() !== endDate.getMonth() && {
              month: 'short',
            }),
            day: '2-digit',
          })}.`.replace(/\.\.$/, '.'),
    startDate,
    start,
    end,
    ...eventProps,
  }
}

export const sendEmails = async (diff: Diff) => {
  for (const [userId, userDiff] of Object.entries(diff)) {
    if (!userDiff.added.length && !userDiff.removed.length) continue

    const processedDiff = {
      added: _.sortBy(
        userDiff.added.map(eventFormat),
        ({startDate}) => startDate,
      ),
      removed: _.sortBy(
        userDiff.removed.map(eventFormat),
        ({startDate}) => startDate,
      ),
    }

    email
      .send({
        template: 'update',
        message: {
          to: users[userId].email,
        },
        locals: {
          name: users[userId].name,
          diff: processedDiff,
        },
      })
      .then(console.log)
      .catch(console.error)
  }
}
