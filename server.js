import log from ;
// server.js
import express from ;
import cors from ;
import os from ;
import { info } from ;
import routes from ;

const app = express();
app.use(cors());
app.use(express.json({ limit:  }));
app.use(express.urlencoded({ extended: true }));

// Mount all routes at once
app.use(, routes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  info( + PORT);
  info();
});
