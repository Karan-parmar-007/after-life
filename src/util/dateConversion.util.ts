import moment from "moment";

const DateConversion = (dateStr: Date, days: string) => {
      let date = moment(dateStr);

      // Convert the 'days' string to a number before adding
      let newDate = date.add(parseInt(days, 10), 'days');

      // Format the new date
      let formattedDate = newDate.format('YYYY/MM/DD');

      // Get the current date and format it
      let currentDate = moment();
      let formattedCurrentDate = currentDate.format('YYYY/MM/DD');

      console.log(formattedCurrentDate, formattedDate)
      // Return true if the formatted dates are the same
      return formattedDate === formattedCurrentDate;
}

export default DateConversion