export const generateMediaHtml = (media: any) => {
    return `
        <html>
        <head>
            <style>
                body {
                    font-family: Arial, sans-serif;
                }
                .container {
                    margin: 0 auto;
                    padding: 20px;
                    max-width: 600px;
                }
                .media {
                    margin-bottom: 20px;
                }
                img, video, audio {
                    max-width: 100%;
                    height: auto;
                    display: block;
                }
                .text-content {
                    white-space: pre-wrap;
                    background-color: #f9f9f9;
                    padding: 10px;
                    border-radius: 5px;
                    font-size: 14px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                ${media.image ? `
                <div class="media">
                    <h3>Image</h3>
                    <img src="${media.image}" alt="Image">
                </div>
                ` : ''}

                ${media.video ? `
                <div class="media">
                    <h3>Video</h3>
                    <video controls>
                        <source src="${media.video}" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>
                </div>
                ` : ''}

                ${media.audio ? `
                <div class="media">
                    <h3>Audio</h3>
                    <audio controls>
                        <source src="${media.audio}" type="audio/mpeg">
                        Your browser does not support the audio element.
                    </audio>
                </div>
                ` : ''}

                ${media.text ? `
                <div class="media">
                    <h3>Text</h3>
                    <div class="text-content">
                        ${media.text}
                    </div>
                </div>
                ` : ''}
            </div>
        </body>
        </html>
    `;
};
export const getResponseHtmlForMail = (userId: string, platform: string, text: string, notificationId?: string, relative?: string) => {
    const url = relative && notificationId ?
        `http://ec2-13-51-70-166.eu-north-1.compute.amazonaws.com:8080/api/v1/delivery-response?userId=${userId}&relativeId=${relative}&notificationId=${notificationId}&platform=${platform}`
        :
        `http://ec2-13-51-70-166.eu-north-1.compute.amazonaws.com:8080/api/v1/delivery-response?userId=${userId}&notificationId=${notificationId}&platform=${platform}`
    const html = `
      <html>
      <head>
        <style>
          .button {
            display: inline-block;
            padding: 10px 20px;
            font-size: 16px;
            font-weight: bold;
            text-align: center;
            text-decoration: none;
            background-color: #4CAF50;
            color: white;
            border-radius: 5px;
            border: none;
            cursor: pointer;
          }
          .button:hover {
            background-color: #45a049;
          }
        </style>
      </head>
      <body>
      <p>${text}</p>
        <p>Click the button below to open the link:</p>
        <a href="${url}" target="_blank">
          <button class="button">Open Link</button>
        </a>
      </body>
      </html>
    `
    return html
}
