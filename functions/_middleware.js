export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === 'asiarix24.pages.dev') {
    return Response.redirect('https://spheretap.com' + url.pathname + url.search, 301);
  }
  return context.next();
}