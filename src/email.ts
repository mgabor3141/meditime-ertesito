import {Diff} from './calendar'
import Email from 'email-templates'
import {CalendarEvent} from './events'
import {users} from './users'

const email = new Email({
  message: {
    from: process.env.SENDER_EMAIL,
  },
  send: true,
  transport: {
    service: 'gmail',
    auth: {
      user: process.env.SENDER_EMAIL,
      pass: process.env.SENDER_PW,
    },
  },
  juice: true,
  juiceResources: {
    inlinePseudoElements: true,
  },
})

const eventFormat = ({start, end, ...eventProps}: CalendarEvent) => {
  const startDate = new Date((start.date || start.dateTime) as string)
  const endDate = new Date((end.date || end.dateTime) as string)

  if (start.date) endDate.setDate(endDate.getDate() - 1)

  return {
    timeString: start.date
      ? `${startDate
          .toLocaleString('hu-HU', {
            month: 'short',
            day: '2-digit',
          })
          .replace(/.$/, '')}${
          startDate.getTime() !== endDate.getTime()
            ? `-${endDate.toLocaleString('hu-HU', {
                ...(startDate.getMonth() !== endDate.getMonth() && {
                  month: 'short',
                }),
                day: '2-digit',
              })}.`
            : ''
        }`.replace(/\.\.$/, '.')
      : start.dateTime
      ? `${startDate.toLocaleTimeString('hu-HU', {
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })}-${endDate.toLocaleTimeString('hu-HU', {
          ...(startDate.getMonth() !== endDate.getMonth() && {
            month: 'short',
          }),
          ...(startDate.getDate() !== endDate.getDate() && {
            day: '2-digit',
          }),
          hour: '2-digit',
          minute: '2-digit',
        })}`
      : `${Object.values(start).join(' ')} ${Object.values(end).join(' ')}`,
    start,
    end,
    ...eventProps,
  }
}

export const sendEmails = async (diff: Diff) => {
  for (const [userId, userDiff] of Object.entries(diff)) {
    if (!userDiff.added.length && !userDiff.removed.length) continue

    const processedDiff = {
      added: userDiff.added.map(eventFormat),
      removed: userDiff.removed.map(eventFormat),
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
