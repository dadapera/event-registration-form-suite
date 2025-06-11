document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('booking-form');
    const totalCostElement = document.getElementById('total-cost');
  
    form.addEventListener('input', () => {
      const roomType = form.elements['room-type'].value;
      const numGuests = parseInt(form.elements['num-guests'].value, 10) || 0;
  
      let roomCost = 0;
      if (roomType === 'singola') roomCost = 1000;
      else if (roomType === 'doppia') roomCost = 2000;
      else if (roomType === 'tripla') roomCost = 3000;
  
      const totalCost = roomCost * numGuests;
      totalCostElement.textContent = `€ ${totalCost.toFixed(2)}`;
    });
  });
  