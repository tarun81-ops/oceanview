const response = await fetch('/data/profiles.json');
if (!response.ok) throw new Error('Could not load profile data');
return response.json();