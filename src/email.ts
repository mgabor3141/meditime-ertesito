import {Diff} from './calendar'
import Email from 'email-templates'
import {users} from './users'

const email = new Email({
  message: {
    from: process.env.SENDER_EMAIL,
  },
  transport: {
    service: 'gmail',
    auth: {
      user: process.env.SENDER_EMAIL,
      pass: process.env.SENDER_PW,
    },
  },
})

export const sendEmails = async (diff: Diff) => {
  for (const [userId, userDiff] of Object.entries(diff)) {
    email
      .send({
        template: 'update',
        message: {
          to: users[userId].email,
        },
        locals: {
          name: users[userId].name,
          diff: userDiff,
        },
      })
      .then(console.log)
      .catch(console.error)
  }
}
