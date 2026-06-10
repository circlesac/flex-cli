import { defineCommand } from "citty";
import { checkinListCommand } from "./list.ts";
import { checkinShowCommand } from "./show.ts";
import { checkinSetCommand } from "./set.ts";
import { checkinSubmitCommand } from "./submit.ts";

export const checkinCommand = defineCommand({
  meta: {
    name: "checkin",
    description: "Quarterly Check-in / 하향 평가 작성·제출",
  },
  subCommands: {
    list: checkinListCommand,
    show: checkinShowCommand,
    set: checkinSetCommand,
    submit: checkinSubmitCommand,
  },
});
