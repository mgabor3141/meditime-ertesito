export const getDateForMonth = (month: number) => {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() + month)
  return date.toISOString().split('T')[0].replace(/-/g, '.')
}
