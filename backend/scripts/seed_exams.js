const prisma = require("../prisma");

async function seedExams() {
  console.log("Seeding Athena exams with questions and future scheduling...");

  // Ensure an author/creator user exists
  let creator = await prisma.user.findFirst();

  if (!creator) {
    creator = await prisma.user.create({
      data: {
        name: "Athena Academic System",
        email: "system@athena.local",
        passwordHash: "$2a$08$K88jY6YJ6.q/nQzU8e6F0u8u0uK88jY6YJ6.q/nQzU8e6F0u8u0u",
        role: "STUDENT",
      },
    });
  }

  const creatorId = creator.id;

  const examsData = [
    {
      id: "cs-401",
      title: "Advanced Computer Networks & Distributed Systems",
      description: "Department of Computer Science & Engineering - End-Term Comprehensive Exam",
      durationMinutes: 90,
      totalMarks: 100,
      negativeMarking: 0.5,
      status: "PUBLISHED",
      startTime: null,
      endTime: null,
      instructions: "Fullscreen desktop lock enforced. Web camera and microphone telemetry active.",
      questions: [
        {
          order: 1,
          text: "In a distributed systems environment, which theorem states that it is impossible for a distributed data store to simultaneously provide more than two out of Consistency, Availability, and Partition Tolerance?",
          options: [
            "CAP Theorem (Brewer's Theorem)",
            "Byzantine Generals Theorem",
            "Amdahl's Law",
            "Nyquist-Shannon Sampling Theorem",
          ],
          correctAnswer: "0",
          marks: 25,
        },
        {
          order: 2,
          text: "Which protocol operates at the Transport Layer of the OSI Model and provides connectionless, best-effort message delivery without transmission guarantees?",
          options: [
            "Transmission Control Protocol (TCP)",
            "User Datagram Protocol (UDP)",
            "Internet Control Message Protocol (ICMP)",
            "Border Gateway Protocol (BGP)",
          ],
          correctAnswer: "1",
          marks: 25,
        },
        {
          order: 3,
          text: "What consensus algorithm is specifically designed to achieve leader election and log replication consistency across fault-tolerant distributed clusters with high understandability?",
          options: [
            "Raft Consensus Algorithm",
            "Dijkstra's Shortest Path Algorithm",
            "Bellman-Ford Distance Vector Algorithm",
            "Diffie-Hellman Key Exchange",
          ],
          correctAnswer: "0",
          marks: 25,
        },
        {
          order: 4,
          text: "When a TLS/SSL session handshake occurs, which cryptographic mechanism is primarily utilized to establish the shared symmetric session key securely across an untrusted network?",
          options: [
            "Asymmetric Public Key Encryption / Diffie-Hellman",
            "Simple XOR Cipher Masking",
            "Cyclic Redundancy Check (CRC-32)",
            "HMAC-SHA256 Token Signing",
          ],
          correctAnswer: "0",
          marks: 25,
        },
      ],
    },
    {
      id: "cs-302",
      title: "Design & Analysis of Algorithms",
      description: "Department of Computer Science & Engineering - Mid-Term Assessment",
      durationMinutes: 120,
      totalMarks: 100,
      negativeMarking: 0,
      status: "PUBLISHED",
      startTime: null,
      endTime: null,
      instructions: "Solve all algorithm design and complexity analysis problems. Scratch work permitted.",
      questions: [
        {
          order: 1,
          text: "What is the worst-case asymptotic time complexity of Merge Sort on an array of size n?",
          options: [
            "O(n log n)",
            "O(n^2)",
            "O(n)",
            "O(log n)",
          ],
          correctAnswer: "0",
          marks: 25,
        },
        {
          order: 2,
          text: "Which of the following conditions is strictly required for Dijkstra's Single Source Shortest Path algorithm to yield correct results?",
          options: [
            "All edge weights must be non-negative",
            "The graph must be a directed acyclic graph (DAG)",
            "The graph must be bipartite",
            "All vertices must have an even degree",
          ],
          correctAnswer: "0",
          marks: 25,
        },
        {
          order: 3,
          text: "Which key algorithmic property characterizes problems that can be solved effectively using Dynamic Programming?",
          options: [
            "Optimal Substructure and Overlapping Subproblems",
            "Greedy Choice Property with Independent Subproblems",
            "Divide and Conquer with disjoint subproblems",
            "Markov Decision Process memorylessness",
          ],
          correctAnswer: "0",
          marks: 25,
        },
        {
          order: 4,
          text: "What is the time complexity of the Floyd-Warshall All-Pairs Shortest Path algorithm on a graph with V vertices?",
          options: [
            "O(V^3)",
            "O(V * E log V)",
            "O(V^2)",
            "O(E^2)",
          ],
          correctAnswer: "0",
          marks: 25,
        },
      ],
    },
    {
      id: "se-204",
      title: "Operating Systems & Concurrency Architecture",
      description: "Software Engineering Division - Module Assessment 2",
      durationMinutes: 75,
      totalMarks: 75,
      negativeMarking: 0.33,
      status: "PUBLISHED",
      startTime: null,
      endTime: null,
      instructions: "Kernel design, virtual memory, and concurrency primitives assessment.",
      questions: [
        {
          order: 1,
          text: "Which of the following is NOT one of Coffman's four necessary conditions for a deadlock to occur in an operating system?",
          options: [
            "Preemption (resources can be forcibly taken)",
            "Mutual Exclusion",
            "Hold and Wait",
            "Circular Wait",
          ],
          correctAnswer: "0",
          marks: 18.75,
        },
        {
          order: 2,
          text: "In virtual memory paging systems, Belady's Anomaly (where increasing the number of page frames results in more page faults) is observed in which algorithm?",
          options: [
            "First-In, First-Out (FIFO)",
            "Least Recently Used (LRU)",
            "Optimal Page Replacement (OPT)",
            "Clock Algorithm",
          ],
          correctAnswer: "0",
          marks: 18.75,
        },
        {
          order: 3,
          text: "Which synchronization primitive uses atomic hardware instructions (e.g. Test-and-Set) to provide mutual exclusion without thread descheduling?",
          options: [
            "Spinlock",
            "Counting Semaphore",
            "Condition Variable",
            "Message Queue",
          ],
          correctAnswer: "0",
          marks: 18.75,
        },
        {
          order: 4,
          text: "When an operating system transitions from executing a user thread to handling an interrupt, what state must be saved to the Process Control Block (PCB)?",
          options: [
            "CPU registers, Program Counter, and Stack Pointer",
            "Disk block cache and inode table",
            "Network socket buffer queues only",
            "Virtual memory swap partition table",
          ],
          correctAnswer: "0",
          marks: 18.75,
        },
      ],
    },
    {
      id: "cs-501",
      title: "Artificial Intelligence & Neural Architectures",
      description: "Department of Artificial Intelligence & Data Science - End-Term Evaluation",
      durationMinutes: 60,
      totalMarks: 100,
      negativeMarking: 0.25,
      status: "PUBLISHED",
      startTime: null,
      endTime: null,
      instructions: "Deep learning, transformer architectures, and heuristic search examination.",
      questions: [
        {
          order: 1,
          text: "In deep neural networks, which activation function mitigates the vanishing gradient problem in hidden layers by providing a constant derivative of 1 for positive inputs?",
          options: [
            "Rectified Linear Unit (ReLU)",
            "Sigmoid function",
            "Hyperbolic Tangent (Tanh)",
            "Softmax function",
          ],
          correctAnswer: "0",
          marks: 25,
        },
        {
          order: 2,
          text: "What computational mechanism allows Transformer models to process all tokens in a sequence concurrently while capturing pairwise dependencies?",
          options: [
            "Multi-Head Scaled Dot-Product Self-Attention",
            "Recurrent Gated Hidden Unit (GRU)",
            "Bidirectional Convolutional Pooling",
            "Max-Margin Discriminant Projection",
          ],
          correctAnswer: "0",
          marks: 25,
        },
        {
          order: 3,
          text: "In the A* heuristic graph search algorithm, what condition must the heuristic function h(n) satisfy to guarantee finding the optimal shortest path on trees?",
          options: [
            "Admissibility (never overestimating the true cost to the goal)",
            "Monotonicity with negative edge weights",
            "Convexity across all neighboring frontiers",
            "Strict equality to Dijkstra's distance label",
          ],
          correctAnswer: "0",
          marks: 25,
        },
        {
          order: 4,
          text: "What is the primary operational effect of applying Dropout regularization during neural network training?",
          options: [
            "Randomly deactivating a fraction of neurons to prevent co-adaptation and overfitting",
            "Scaling weights to ensure unit L2 norm convergence",
            "Accelerating gradient descent by adapting per-parameter learning rates",
            "Compressing floating-point activations into 8-bit integers",
          ],
          correctAnswer: "0",
          marks: 25,
        },
      ],
    },
    {
      id: "cy-301",
      title: "Applied Cryptography & Cyber Defense",
      description: "Information Security & Cyber Defense Division - Professional Assessment",
      durationMinutes: 90,
      totalMarks: 100,
      negativeMarking: 0.25,
      status: "PUBLISHED",
      startTime: null,
      endTime: null,
      instructions: "Cryptographic protocols, PKI infrastructure, and intrusion analysis.",
      questions: [
        {
          order: 1,
          text: "Which mathematical hardness assumption underpins the security of standard RSA asymmetric public-key cryptography?",
          options: [
            "Difficulty of factoring the product of two large prime numbers",
            "Discrete Logarithm Problem in finite Galois fields",
            "Shortest Vector Problem in Euclidean lattices",
            "Polynomial Root Finding over Ring integers",
          ],
          correctAnswer: "0",
          marks: 25,
        },
        {
          order: 2,
          text: "In a cryptographic protocol, what security objective ensures that an attacker cannot capture and re-transmit a valid authorization packet at a later time?",
          options: [
            "Replay Attack Prevention using Nonces and Timestamps",
            "Cipher Block Chaining (CBC) bit flippability",
            "Forward Secrecy without ephemeral keys",
            "Homomorphic Encryption evaluation",
          ],
          correctAnswer: "0",
          marks: 25,
        },
        {
          order: 3,
          text: "Which of the following symmetric block cipher modes provides both confidentiality and cryptographic integrity verification (Authenticated Encryption)?",
          options: [
            "Galois/Counter Mode (GCM)",
            "Electronic Codebook (ECB)",
            "Cipher Block Chaining (CBC) without HMAC",
            "Output Feedback (OFB)",
          ],
          correctAnswer: "0",
          marks: 25,
        },
        {
          order: 4,
          text: "In a Public Key Infrastructure (PKI), what is the function of a Certificate Revocation List (CRL) or OCSP?",
          options: [
            "To verify whether a digital certificate has been invalidated before its scheduled expiration",
            "To encrypt symmetric session keys with post-quantum algorithms",
            "To distribute private keys to client browsers securely",
            "To perform automated port scanning across firewall perimeters",
          ],
          correctAnswer: "0",
          marks: 25,
        },
      ],
    },
    {
      id: "db-303",
      title: "Advanced Database Internals & Query Optimization",
      description: "Database Systems & Storage Engine Laboratory - Mid-Semester Exam",
      durationMinutes: 60,
      totalMarks: 100,
      negativeMarking: 0,
      status: "PUBLISHED",
      // Scheduled for tomorrow at 2:00 PM IST
      startTime: (() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(14, 0, 0, 0);
        return d;
      })(),
      endTime: (() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(16, 0, 0, 0);
        return d;
      })(),
      instructions: "Storage engines, B+ Trees, ACID transactions, and query planning.",
      questions: [
        {
          order: 1,
          text: "Why are B+ Trees overwhelmingly preferred over standard B Trees for relational database index storage on disk?",
          options: [
            "All keys are replicated in leaf nodes linked sequentially, enabling ultra-fast range scans",
            "B+ Trees have an O(1) worst-case search complexity",
            "B+ Trees consume zero memory in the database buffer pool",
            "B+ Trees completely eliminate index page splits during random inserts",
          ],
          correctAnswer: "0",
          marks: 25,
        },
        {
          order: 2,
          text: "Which ANSI SQL Transaction Isolation Level completely prevents 'Phantom Reads'?",
          options: [
            "SERIALIZABLE",
            "REPEATABLE READ",
            "READ COMMITTED",
            "READ UNCOMMITTED",
          ],
          correctAnswer: "0",
          marks: 25,
        },
        {
          order: 3,
          text: "Under Write-Ahead Logging (WAL) protocols, what rule must the database engine strictly enforce before writing a modified data page to disk?",
          options: [
            "The corresponding log record describing the update must be flushed to non-volatile disk storage first",
            "All active transactions must commit before the page is written",
            "The entire table must acquire an exclusive table-level X lock",
            "A complete database checkpoint must be taken",
          ],
          correctAnswer: "0",
          marks: 25,
        },
        {
          order: 4,
          text: "In Strict Two-Phase Locking (Strict 2PL), when are exclusive (X) locks held by a transaction released?",
          options: [
            "Only when the transaction reaches its Commit or Abort phase",
            "Immediately after the specific record write operation finishes",
            "As soon as the shrinking phase begins",
            "Whenever a concurrent query requests a shared read lock",
          ],
          correctAnswer: "0",
          marks: 25,
        },
      ],
    },
    {
      id: "ds-202",
      title: "Data Structures & Algorithmic Problem Solving",
      description: "Department of Computer Science - Scheduled Assessment",
      durationMinutes: 90,
      totalMarks: 100,
      negativeMarking: 0.25,
      status: "PUBLISHED",
      // Scheduled start deadline of 15 days
      startTime: (() => {
        const d = new Date();
        d.setDate(d.getDate() + 15);
        d.setHours(10, 0, 0, 0);
        return d;
      })(),
      endTime: (() => {
        const d = new Date();
        d.setDate(d.getDate() + 15);
        d.setHours(12, 0, 0, 0);
        return d;
      })(),
      instructions: "Linear & hierarchical data structures, hashing, graphs, and amortized complexity.",
      questions: [
        {
          order: 1,
          text: "What is the worst-case time complexity of lookup in a Hash Table when using separate chaining under poor hash distribution?",
          options: [
            "O(n)",
            "O(1)",
            "O(log n)",
            "O(n log n)",
          ],
          correctAnswer: "0",
          marks: 25,
        },
        {
          order: 2,
          text: "Which self-balancing binary search tree guarantees that the height difference between left and right subtrees never exceeds 1 for any node?",
          options: [
            "AVL Tree",
            "Red-Black Tree",
            "Splay Tree",
            "Treap",
          ],
          correctAnswer: "0",
          marks: 25,
        },
        {
          order: 3,
          text: "What is the amortized cost of inserting an element into a dynamic array (vector) that doubles its capacity upon reaching capacity?",
          options: [
            "O(1)",
            "O(n)",
            "O(log n)",
            "O(n^2)",
          ],
          correctAnswer: "0",
          marks: 25,
        },
        {
          order: 4,
          text: "Which graph traversal algorithm uses a First-In, First-Out (FIFO) queue to visit all vertices at distance k before distance k+1?",
          options: [
            "Breadth-First Search (BFS)",
            "Depth-First Search (DFS)",
            "Topological Sort via Tarjan's algorithm",
            "Kruskal's Minimum Spanning Tree",
          ],
          correctAnswer: "0",
          marks: 25,
        },
      ],
    },
  ];

  for (const item of examsData) {
    const { questions, ...examFields } = item;

    console.log(`Upserting exam: ${examFields.id} - ${examFields.title}`);
    const exam = await prisma.exam.upsert({
      where: { id: examFields.id },
      update: {
        title: examFields.title,
        description: examFields.description,
        durationMinutes: examFields.durationMinutes,
        totalMarks: examFields.totalMarks,
        negativeMarking: examFields.negativeMarking,
        status: examFields.status,
        instructions: examFields.instructions,
        startTime: examFields.startTime,
        endTime: examFields.endTime,
      },
      create: {
        ...examFields,
        creatorId,
      },
    });

    if (questions && questions.length > 0) {
      for (const q of questions) {
        await prisma.question.upsert({
          where: {
            examId_order: {
              examId: exam.id,
              order: q.order,
            },
          },
          update: {
            text: q.text,
            options: q.options,
            correctAnswer: q.correctAnswer,
            marks: q.marks,
          },
          create: {
            examId: exam.id,
            order: q.order,
            text: q.text,
            options: q.options,
            correctAnswer: q.correctAnswer,
            marks: q.marks,
          },
        });
      }
    }
  }

  console.log("Exam seeding successfully completed!");
}

if (require.main === module) {
  seedExams()
    .catch((e) => {
      console.error("Seed error:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = seedExams;

