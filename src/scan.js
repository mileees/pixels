const mongoConnection = require("./db/db");
const { getWs } = require("./ws")
const landSchema = require("./db/land");


mongoConnection.on("error", console.error.bind(console, "connection error:"));
mongoConnection.once("open", function () {
  console.log("connected to mongo db");
});
const Land = mongoConnection.model("Land", landSchema);

const getLandInfo = async (landNumber) => {
    const timestamp = new Date().getTime();
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`https://pixels-server.pixels.xyz/game/findroom/pixelsNFTFarm-${landNumber}/99?v=${timestamp}`);
    
    if (response.status >= 400) {
        console.log("No lands found 3");
        return;
    }

    const landInfo = await response.json();
    landInfo.landNumber = landNumber; 
    return landInfo;
}

const getLandsInfo = async () => {
    const landsIdArray =
    [
        1004, 2396, 2546, 2593, 3122,
        3491, 3839, 3992, 4610, 4743,
        2065, 2102, 2103, 535, 2304,
        2943, 3088, 3273, 3204, 4361,
        2291, 979, 2859, 1898, 1511,
        2955, 553, 3325, 2976, 1254,
        1741, 3403, 3778, 2956, 1495
    ]

    const lands = [];
    for (let i = 0; i <= landsIdArray.length - 1; i++) {
        const info = getLandInfo(landsIdArray[i]);
        if (info) {
            lands.push(info);
        }
    }

    return await Promise.all(lands);
}

const splitTreeTimes = (tree) => {
    const separator = "#";
    const treeData = tree.split(separator);
    return { key: treeData[0], time: treeData[1] };
}

const getSessionInfo = async (land) => {
    if(!land) {
        return;
    }

    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`https://pixels-server.pixels.xyz/matchmake/joinById/${land.roomId}/${land.server}`, {
        method: 'POST',
        body: JSON.stringify(
            {
                "mapId": `pixelsNFTFarm-${String(land.landNumber)}`,
                "token": "iamguest",
                "isGuest": true,
                "cryptoWallet": {},
                "username": "Guest-the-traveling-tourist",
                "world": 99,
                "ver": 7,
                "avatar": "{}"
            }
        ),
        headers: {
            'Content-Type': 'application/json'
        }
    });

    return await response.json();
}

const convertToTimestamp = (time) => {
    // Divide a string de tempo em partes: horas, minutos, segundos e AM/PM
    const [timePart, ampm] = time.split(' ');
  
    // Divide a parte do tempo em horas, minutos e segundos
    const [hours, minutes, seconds] = timePart.split(':').map(Number);
  
    // Converte as horas para o formato de 24 horas, se necessário
    let adjustedHours = hours;
    if (ampm === 'PM' && hours !== 12) {
        adjustedHours += 12;
    } else if (ampm === 'AM' && hours === 12) {
        adjustedHours = 0;
    }
  
    // Cria uma nova data usando a data atual e as horas, minutos e segundos fornecidos
    const currentDate = new Date();
    const timestampDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), adjustedHours, minutes, seconds);
  
    // Retorna o timestamp Unix em milissegundos
    return timestampDate.getTime();
}

const taskv2 = async () => {
    const lands = await getLandsInfo();
    if (!lands) {
      console.log("No lands found 1");
      return;
    }
  
    const sessions = await Promise.all(
      lands.map(async (lands) => {
        const info = await getSessionInfo(lands);
        if (!info || !info.room) {
          console.log("No session found");
          return;
        }
        return info;
      })
    );

    const wsPromises = sessions.map(async (session, index) => {
      return await getWs(session, lands[index]);
    });
  
    const wsdata = await Promise.all(wsPromises);
    return wsdata;
}

const runTask = async () => {
    console.log("Runing task")
    await taskv2()
    .then((lands) => {
        //remove undefined values from lands
        lands = lands.filter((land) => land !== undefined);
        //validate if lands is empty
        if (!lands || lands.length === 0) {
        console.log("No lands found 2");
        return;
        }

        lands = lands.map((land) => {
        return {
            land: land.land,
            guild: land.guild || "",
            trees: land.trees.map((tree) => splitTreeTimes(tree)),
            treesTimestamp: land.trees.map((tree) =>
            convertToTimestamp(splitTreeTimes(tree).time)
            ),
        };
        });

        lands.forEach((land) => {
        mongoConnection
            .collection("lands")
            .findOne({ land: String(land.land) }, function (err, res) {
            if (err) throw err;
            if (res) {
                mongoConnection.collection("lands").updateOne(
                { land: String(land.land) },
                {
                    $set: {
                        trees: land.trees,
                        guild: land.guild,
                        treesTimestamp: land.treesTimestamp,
                        updatedAt: new Date(),
                    },
                },
                function (err, res) {
                    if (err) throw err;
                    console.log("1 document updated");
                }
                );
            } else {
                const landDocument = new Land(land);
                mongoConnection
                .collection("lands")
                .insertOne(landDocument, function (err, res) {
                    if (err) throw err;
                });
            }
            });
        });
    })
    .catch((error) => {
        console.error("Task failed", error);
        throw error;
    });
}

async function safeExecution() {
    try {
      runTask()
        .then(() => {
          console.log("All tasks completed");
        })
        .catch((error) => {
          console.error("All tasks failed", error);
        });
    } catch (error) {
      console.log("waiting 10 minutes before retrying");
      setTimeout(safeExecution, 300000);
    }
}

safeExecution()

setInterval(() => {
    safeExecution()
}, 30 * 60 * 1000)