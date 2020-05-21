import * as admin from 'firebase-admin';

admin.initializeApp();

import * as functions from 'firebase-functions';
import fetch from 'node-fetch';
import * as _ from 'lodash';
const firestore = admin.firestore();
const telegram = require('telegram-bot-api');

import queries from './queries';

// queries should look like:
// export default {
//   'buy-4-4':
//     'https://www.yad2.co.il/api/pre-load/getFeedIndex/realestate/forsale?area=48&property=3&rooms=4-4&price=-2000000-2500000&compact-req=1&forceLdLoad=true',
//   'rent-2-3':
//     'https://www.yad2.co.il/api/pre-load/getFeedIndex/realestate/rent?area=48&property=3&rooms=2-3&price=2000-3000&compact-req=1&forceLdLoad=true',
// };
//
// use mobile version of Yad2 to get the search URLs

// telegramConsts should look like:
//
// export default {
//   token: '876543234:AAGaslkmdOKRGdmkmsadlm12dasd',
//   chatIds: ['123456789', '12345678'],
// };
//
// to get a token, message @BotFather in Telegram
// to get a chat id, message @get_id_bot
//
import telegramConsts from './telegram-consts';

type TQueryType = keyof typeof queries;

async function fetchData(queryType: TQueryType) {
  return await fetch(queries[queryType], {
    method: 'GET',
  })
    .then((res) => res.json())
    .then((res) => res.feed.feed_items.filter((item: any) => item.id));
}

async function getNewListings() {
  const newApts = await Promise.all(
    Object.keys(queries).map((queryType) => {
      return fetchData(queryType as TQueryType);
    })
  );

  const newAptsIds = _.flatten(newApts).map((item: any) => item.id);

  const seenApts = (
    ((await firestore.doc('data/apts').get()).data() as any) ?? {
      data: [],
    }
  ).data;
  const newSeenApts = _.uniq([...seenApts, ...newAptsIds]);
  await firestore.doc('data/apts').set({ data: newSeenApts });

  const unseenApts = _.flatten(newApts).filter(
    (apt) => seenApts.indexOf(apt.id) === -1
  );

  return unseenApts;
}

async function sendNewAptsMessage(apts: any[]) {
  const telegramAPI = new telegram({
    token: telegramConsts.token,
    updates: {
      enabled: true,
    },
  });

  for (const apt of apts) {
    await telegramAPI.sendMessage({
      chat_id: telegramConsts.chatIds[0],
      text: [
        `New Apartment Found:`,
        `https://www.yad2.co.il/s/c/${apt.id}`,
        `Price: ${apt.price}`,
      ].join('\n\n'),
    });

    for (const key of Object.keys(apt.images)) {
      await telegramAPI.sendPhoto({
        chat_id: telegramConsts.chatIds[0],
        caption: `Image ${key}`,
        photo: apt.images[key].src,
      });
    }

    await telegramAPI.sendMessage({
      chat_id: telegramConsts.chatIds[1],
      text: [
        `New Apartment Found:`,
        `https://www.yad2.co.il/s/c/${apt.id}`,
        `Price: ${apt.price}`,
      ].join('\n\n'),
    });

    for (const key of Object.keys(apt.images)) {
      await telegramAPI.sendPhoto({
        chat_id: telegramConsts.chatIds[1],
        caption: `Image ${key}`,
        photo: apt.images[key].src,
      });
    }
  }
}

export const getApts = functions.https.onRequest(async (request, response) => {
  const apts = await getNewListings();

  if (apts.length) {
    await sendNewAptsMessage(apts);
  }

  response.send(apts);
});

export const resetData = functions.https.onRequest(
  async (request, response) => {
    await firestore.doc('data/apts').set({ data: [] });

    response.send({ success: true });
  }
);
