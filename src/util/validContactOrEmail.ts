export function checkInputType(input:string) {
    const contactRegex = /^(?:\+?\d{1,3}[- ]?)?\d{10}$/;  // For contact numbers
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;  // For emails
    
    if (emailRegex.test(input)) {
      return 'email';
    } else if (contactRegex.test(input)) {
      return 'contact';
    } else {
      return 'invalid';
    }
  }
  
  