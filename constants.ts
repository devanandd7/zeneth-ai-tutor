
import { TutorialStep, ActionType } from './types';

export const TUTORIAL_DATA: TutorialStep[] = [
  {
    title: "The Heart of the Internet: Client-Server",
    narrative: "Think of the internet like a conversation. Every time you open an app, you're the 'Client' starting a talk. You send a 'Request', and somewhere in the world, a 'Server' prepares a 'Response' specifically for you. It's the most fundamental handshake in technology.",
    duration: 15,
    timeline: [
      { time: 0, action: ActionType.TEXT, speed: 50 },
      { time: 0, action: ActionType.VOICE },
      { time: 1.5, action: ActionType.DRAW, element: { id: 'client', type: 'emoji', content: '👤', label: 'Client (You)', x: 20, y: 50 } },
      { time: 4, action: ActionType.DRAW, element: { id: 'req', type: 'arrow', content: '→', label: 'HTTP Request', x: 45, y: 45 } },
      { time: 7, action: ActionType.DRAW, element: { id: 'server', type: 'emoji', content: '🖥️', label: 'Remote Server', x: 75, y: 50 } },
      { time: 10, action: ActionType.HIGHLIGHT, target: 'server' },
      { time: 12, action: ActionType.DRAW, element: { id: 'res', type: 'arrow', content: '←', label: 'HTTP Response', x: 45, y: 55, rotation: 180 } }
    ]
  },
  {
    title: "DNS: The Phonebook of the Web",
    narrative: "Computers don't actually understand words like 'google.com'. They talk in numbers called IP addresses. DNS acts as a massive global translator. You give it a name, and it hands you back a digital coordinate so your browser knows exactly where to go.",
    duration: 18,
    timeline: [
      { time: 0, action: ActionType.TEXT, speed: 50 },
      { time: 0, action: ActionType.VOICE },
      { time: 2, action: ActionType.DRAW, element: { id: 'user_dns', type: 'emoji', content: '🔍', label: 'Browser', x: 15, y: 65 } },
      { time: 4, action: ActionType.DRAW, element: { id: 'dns_srv', type: 'emoji', content: '🌐', label: 'DNS Registry', x: 50, y: 30 } },
      { time: 6, action: ActionType.DRAW, element: { id: 'dns_req', type: 'arrow', label: 'Where is site.com?', x: 35, y: 45 } },
      { time: 9, action: ActionType.HIGHLIGHT, target: 'dns_srv' },
      { time: 11, action: ActionType.DRAW, element: { id: 'dns_res', type: 'arrow', label: 'At 172.16.0.1', x: 35, y: 55, rotation: 180 } },
      { time: 14, action: ActionType.DRAW, element: { id: 'target_srv', type: 'emoji', content: '💾', label: 'Data Center', sublabel: '172.16.0.1', x: 80, y: 65 } }
    ]
  },
  {
    title: "Load Balancing: Managing the Crowd",
    narrative: "When millions of people visit a site at once, one server would explode! So we use a 'Load Balancer'. It's like a traffic cop standing in front of a fleet of servers, ensuring every request goes to the one that's least busy. Perfectly balanced, as all things should be.",
    duration: 20,
    timeline: [
      { time: 0, action: ActionType.TEXT, speed: 50 },
      { time: 0, action: ActionType.VOICE },
      { time: 2, action: ActionType.DRAW, element: { id: 'crowd', type: 'emoji', content: '👥', label: 'High Traffic', x: 10, y: 50 } },
      { time: 5, action: ActionType.DRAW, element: { id: 'lb', type: 'emoji', content: '⚖️', label: 'Load Balancer', x: 40, y: 50 } },
      { time: 8, action: ActionType.HIGHLIGHT, target: 'lb' },
      { time: 10, action: ActionType.DRAW, element: { id: 's1', type: 'emoji', content: '📟', label: 'Node A', x: 75, y: 20 } },
      { time: 11.5, action: ActionType.DRAW, element: { id: 's2', type: 'emoji', content: '📟', label: 'Node B', x: 75, y: 50 } },
      { time: 13, action: ActionType.DRAW, element: { id: 's3', type: 'emoji', content: '📟', label: 'Node C', x: 75, y: 80 } },
      { time: 15, action: ActionType.DRAW, element: { id: 'a1', type: 'arrow', x: 55, y: 35 } },
      { time: 16, action: ActionType.DRAW, element: { id: 'a2', type: 'arrow', x: 55, y: 50 } },
      { time: 17, action: ActionType.DRAW, element: { id: 'a3', type: 'arrow', x: 55, y: 65 } }
    ]
  }
];
