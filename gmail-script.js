function processNewEmails() {
    // Get emails from last 5 minutes (adjust as needed)
    var date = new Date();
    date.setMinutes(date.getMinutes() - 6);
    var searchQuery = 'after:' + Utilities.formatDate(date, 'GMT', 'yyyy/MM/dd HH:mm:ss');
    
    var threads = GmailApp.search(searchQuery, 0, 10);
    for (var i = 0; i < threads.length; i++) {
      var messages = threads[i].getMessages();
      for (var j = 0; j < messages.length; j++) {
        var message = messages[j];
        
        // Process only unread messages
        if (message.isUnread()) {
          var emailData = {
            subject: message.getSubject(),
            from: message.getFrom(),
            body: message.getPlainBody(),
            date: message.getDate()
          };
          
          // Call your Cloud Function
          callCloudFunction(emailData);
          
          // Mark as read (optional)
          message.markRead();
        }
      }
    }
  }
  
  function callCloudFunction(emailBody) {
    var cloudFunctionUrl = 'https://us-central1-prizmpoc.cloudfunctions.net/processInputAndInitiateSession';
    var options = {
      'method': 'post',
      'contentType': 'text/plain',
      'payload': emailBody,
      'headers': {
        'Authorization': 'Bearer ' + getOAuthToken()
      }
    };
    
    try {
      var response = UrlFetchApp.fetch(cloudFunctionUrl, options);
      Logger.log(response.getContentText());
    } catch (e) {
      Logger.log('Error calling Cloud Function: ' + e.toString());
    }
  }
  
  function getOAuthToken() {
    // This uses the OAuth2 library which they'll need to add to their script
    // Script ID: 1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF
    var oauth = OAuth2.createService('gcpservice')
      .setAuthorizationBaseUrl('https://accounts.google.com/o/oauth2/auth')
      .setTokenUrl('https://accounts.google.com/o/oauth2/token')
      .setClientId('-set-this-')
      .setClientSecret('-set-this-')
      .setCallbackFunction('authCallback')
      .setScope('https://www.googleapis.com/auth/cloud-platform')
      .setPropertyStore(PropertiesService.getUserProperties());
    
    var token = oauth.getAccessToken();
    return token;
  }
  
  function authCallback(request) {
    var oauth = getOAuthService();
    var isAuthorized = oauth.handleCallback(request);
    if (isAuthorized) {
      return HtmlService.createHtmlOutput('Success! You can close this tab.');
    } else {
      return HtmlService.createHtmlOutput('Authorization denied.');
    }
  }
  
  function startAuthorization() {
    var oauth = getOAuthService();
    var authUrl = oauth.getAuthorizationUrl();
    var template = HtmlService.createTemplate(
      '<a href="<?= authUrl ?>" target="_blank">Authorize</a>. ' +
      'Reopen this page when authorization is complete.');
    template.authUrl = authUrl;
    var page = template.evaluate();
    return page;
  }
