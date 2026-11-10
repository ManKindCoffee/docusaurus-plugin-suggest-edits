// No sign-in: everyone is anonymous, and rate limits use the IP address
export function anonymous() {
  return () => null;
}

// Signed-in users via Azure Static Web Apps, which passes the user in this header.
// Only trust it when the handler can ONLY be reached through Static Web Apps,
// because anyone calling the handler directly can forge the header.
export function staticWebAppsAuth({required = true} = {}) {
  return (req) => {
    const header = req.headers['x-ms-client-principal'];
    if (!header) {
      if (required) throw authError();
      return null;
    }

    let principal;
    try {
      principal = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    } catch {
      throw authError();
    }
    if (!principal?.userId) throw authError();

    const claim = (...types) => principal.claims?.find((c) => types.includes(c.typ))?.val;
    const fullName = [
      claim('given_name', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'),
      claim('family_name', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'),
    ]
      .filter(Boolean)
      .join(' ');

    return {
      id: principal.userId,
      name: fullName || claim('name') || principal.userDetails,
      provider: principal.identityProvider,
    };
  };
}

function authError() {
  return Object.assign(new Error('Please sign in to suggest an edit.'), {status: 401});
}