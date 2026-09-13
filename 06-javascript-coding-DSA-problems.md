Here are the answers to your questions, designed to be clear, simple, and easy to understand with commented code.

### **Array-Based Questions**

These questions test your ability to manipulate and process collections of data efficiently, a common task in frontend development.

**1. Remove Duplicates from an Array: Write a function to filter out duplicate values from an array.**

```javascript
function removeDuplicates(arr) {
  // Create an empty array to store unique elements.
  const uniqueArray = [];

  // Loop through each element of the input array.
  for (let i = 0; i < arr.length; i++) {
    // Check if the current element is already in the uniqueArray.
    if (uniqueArray.indexOf(arr[i]) === -1) {
      // If it's not present, add it to the uniqueArray.
      uniqueArray.push(arr[i]);
    }
  }

  // Return the array with unique elements.
  return uniqueArray;
}
```

**2. Flatten a Deeply Nested Array: Implement a function to flatten an array of arbitrarily nested arrays into a single-level array.**

```javascript
function flattenArray(arr) {
  // Create an empty array to store the flattened elements.
  const flattened = [];

  // Loop through each element of the input array.
  for (let i = 0; i < arr.length; i++) {
    // Check if the current element is an array.
    if (Array.isArray(arr[i])) {
      // If it is an array, recursively call flattenArray on it
      // and concatenate the result to the flattened array.
      flattened.push(...flattenArray(arr[i]));
    } else {
      // If it's not an array, push the element directly.
      flattened.push(arr[i]);
    }
  }

  // Return the flattened array.
  return flattened;
}
```

**3. Two Sum: Given an array of integers, find two numbers that add up to a specific target.**

```javascript
function twoSum(nums, target) {
  // Create an object to store numbers we've seen and their indices.
  const numMap = {};

  // Loop through each number in the array.
  for (let i = 0; i < nums.length; i++) {
    // Calculate the complement needed to reach the target.
    const complement = target - nums[i];

    // Check if the complement exists in our map.
    if (numMap[complement] !== undefined) {
      // If it exists, we've found our pair.
      // Return the index of the complement and the current index.
      return [numMap[complement], i];
    }

    // If the complement is not found, store the current number and its index in the map.
    numMap[nums[i]] = i;
  }
}
```

**4. Merge Two Sorted Arrays: Write a function that merges two sorted arrays into a single sorted array without using built-in sort functions.**

Of course, let's continue.

```javascript
function mergeSortedArrays(arr1, arr2) {
  // Create an empty array to store the merged result.
  const mergedArray = [];
  // Initialize pointers for both arrays.
  let i = 0; // Pointer for arr1
  let j = 0; // Pointer for arr2

  // Loop as long as there are elements in both arrays.
  while (i < arr1.length && j < arr2.length) {
    // Compare the elements at the current pointers.
    if (arr1[i] < arr2[j]) {
      // If the element in arr1 is smaller, push it to the merged array.
      mergedArray.push(arr1[i]);
      // Move the pointer for arr1 forward.
      i++;
    } else {
      // If the element in arr2 is smaller or equal, push it.
      mergedArray.push(arr2[j]);
      // Move the pointer for arr2 forward.
      j++;
    }
  }

  // After the main loop, one of the arrays may still have elements left.
  // Add all remaining elements from arr1, if any.
  while (i < arr1.length) {
    mergedArray.push(arr1[i]);
    i++;
  }

  // Add all remaining elements from arr2, if any.
  while (j < arr2.length) {
    mergedArray.push(arr2[j]);
    j++;
  }

  // Return the final merged and sorted array.
  return mergedArray;
}
```

**5. Move Zeroes to the End: Rearrange an array to move all zeroes to the end while maintaining the relative order of the non-zero elements.**

```javascript
function moveZeroes(nums) {
  // Initialize a pointer to place the next non-zero number.
  let nonZeroIndex = 0;

  // First loop: move all non-zero elements to the front.
  for (let i = 0; i < nums.length; i++) {
    // If the current element is not zero...
    if (nums[i] !== 0) {
      // ...move it to the position indicated by nonZeroIndex.
      nums[nonZeroIndex] = nums[i];
      // Increment the pointer for the next non-zero element.
      nonZeroIndex++;
    }
  }

  // Second loop: fill the rest of the array with zeroes.
  // This loop starts where the last non-zero element was placed.
  for (let i = nonZeroIndex; i < nums.length; i++) {
    // Fill the remaining spots with 0.
    nums[i] = 0;
  }

  // Return the modified array.
  return nums;
}
```

**6. Rotate Array: Rotate the elements of an array to the right by a specified number of steps, `k`.**

```javascript
function rotateArray(nums, k) {
  // Handle cases where k is larger than the array length.
  // The result of rotation by k is the same as rotation by k % length.
  const rotations = k % nums.length;

  // Perform the rotation `rotations` number of times.
  for (let i = 0; i < rotations; i++) {
    // Remove the last element from the array.
    const lastElement = nums.pop();
    // Add that element to the beginning of the array.
    nums.unshift(lastElement);
  }

  // Return the rotated array.
  return nums;
}
```

**7. Find the Missing Number: Given an array containing n distinct numbers taken from 0, 1, 2, ..., n, find the one that is missing.**

```javascript
function findMissingNumber(nums) {
  // The length of the array is n, because it's missing one number from the 0 to n sequence.
  const n = nums.length;

  // Calculate the expected sum of numbers from 0 to n.
  // The formula for the sum of an arithmetic series is n * (n + 1) / 2.
  const expectedSum = n * (n + 1) / 2;

  // Calculate the actual sum of the elements in the given array.
  let actualSum = 0;
  for (let i = 0; i < nums.length; i++) {
    actualSum += nums[i];
  }

  // The missing number is the difference between the expected sum and the actual sum.
  return expectedSum - actualSum;
}```

**8. Maximum Subarray Sum (Kadane's Algorithm): Find the contiguous subarray with the largest sum and return its sum.**

```javascript
function maxSubarraySum(nums) {
  // Initialize the maximum sum to the first element of the array.
  let maxSoFar = nums[0];
  // Initialize the sum of the current subarray.
  let maxEndingHere = nums[0];

  // Loop through the array starting from the second element.
  for (let i = 1; i < nums.length; i++) {
    // Decide whether to extend the current subarray or start a new one.
    // We take the larger of either the current number itself or the current number added to the previous subarray sum.
    maxEndingHere = Math.max(nums[i], maxEndingHere + nums[i]);
    
    // Update the overall maximum sum if the current subarray sum is greater.
    maxSoFar = Math.max(maxSoFar, maxEndingHere);
  }

  // Return the largest sum found.
  return maxSoFar;
}
```

**9. Product of Array Except Self: Given an array `nums`, return an array `answer` such that `answer[i]` is equal to the product of all the elements of `nums` except `nums[i]`.**

```javascript
function productExceptSelf(nums) {
  const n = nums.length;
  // Initialize the result array with all elements as 1.
  const answer = new Array(n).fill(1);

  // First pass: Calculate the product of all elements to the left of each index.
  let leftProduct = 1;
  for (let i = 0; i < n; i++) {
    // Set the answer at the current index to the product of elements to its left.
    answer[i] = leftProduct;
    // Update the left product for the next iteration.
    leftProduct *= nums[i];
  }

  // Second pass: Calculate the product of all elements to the right and combine it.
  let rightProduct = 1;
  for (let i = n - 1; i >= 0; i--) {
    // Multiply the current answer (which holds the left product) by the right product.
    answer[i] *= rightProduct;
    // Update the right product for the next iteration.
    rightProduct *= nums[i];
  }

  // Return the final answer array.
  return answer;
}
```

**10. Find the Second Largest Number: Write a function to find the second largest number in an array of numbers.**

```javascript
function findSecondLargest(nums) {
  // Initialize largest and secondLargest.
  // Using negative infinity ensures any number in the array will be larger.
  let largest = -Infinity;
  let secondLargest = -Infinity;

  // Handle edge case of an array with less than two numbers.
  if (nums.length < 2) {
    return "Array must contain at least two numbers.";
  }

  // Loop through the array to find the largest and second largest numbers.
  for (let i = 0; i < nums.length; i++) {
    // If the current number is greater than the current largest...
    if (nums[i] > largest) {
      // ...the old largest becomes the new second largest.
      secondLargest = largest;
      // ...and the current number becomes the new largest.
      largest = nums[i];
    } 
    // If the current number is smaller than largest but greater than secondLargest...
    else if (nums[i] > secondLargest && nums[i] < largest) {
      // ...it becomes the new second largest.
      secondLargest = nums[i];
    }
  }

  // Return the second largest number found.
  return secondLargest;
}
```

---

Of course, here are the next set of answers.

**11. Remove Falsy Values: Create a function that removes all falsy values (e.g., `false`, `null`, `0`, `""`, `undefined`, and `NaN`) from an array.**

```javascript
function removeFalsyValues(arr) {
  // Create an empty array to store the truthy values.
  const truthyArray = [];

  // Loop through each element of the input array.
  for (let i = 0; i < arr.length; i++) {
    // In JavaScript, a simple `if` condition checks for truthiness.
    // Falsy values (false, null, 0, "", undefined, NaN) will evaluate to false.
    if (arr[i]) {
      // If the value is truthy, add it to our new array.
      truthyArray.push(arr[i]);
    }
  }

  // Return the array containing only truthy values.
  return truthyArray;
}
```

**12. Sort an Array of Objects by a Key: Given an array of objects, write a function to sort them based on the value of a specific key.**

```javascript
function sortObjectsByKey(arr, key) {
  // Use the built-in sort method, which accepts a custom comparison function.
  // This is the standard way to sort non-numeric or complex data.
  arr.sort((a, b) => {
    // Access the values to compare using the provided key.
    const valueA = a[key];
    const valueB = b[key];

    // The comparison function should return:
    // - A negative number if valueA should come before valueB.
    // - A positive number if valueA should come after valueB.
    // - Zero if their order doesn't matter.
    if (valueA < valueB) {
      return -1; // a comes first
    }
    if (valueA > valueB) {
      return 1; // b comes first
    }
    return 0; // order is unchanged
  });

  // The sort method modifies the array in place, so we can just return it.
  return arr;
}
```

**13. Group Anagrams: Given an array of strings, group the anagrams together.**

```javascript
function groupAnagrams(strs) {
  // Create an object (acting as a hash map) to store groups of anagrams.
  const anagramGroups = {};

  // Loop through each string in the input array.
  for (const str of strs) {
    // Create a canonical representation for each string by sorting its characters.
    // "eat" -> "aet", "tea" -> "aet", "ate" -> "aet"
    const sortedStr = str.split('').sort().join('');

    // Check if this sorted key already exists in our map.
    if (anagramGroups[sortedStr]) {
      // If it exists, push the original string into the corresponding array.
      anagramGroups[sortedStr].push(str);
    } else {
      // If it doesn't exist, create a new array for this key and add the string.
      anagramGroups[sortedStr] = [str];
    }
  }

  // The values of the map are the arrays of anagrams.
  // Return an array of these values.
  return Object.values(anagramGroups);
}
```

**14. Implement `Array.prototype.map`: Re-create the functionality of the `map` method without using the native method.**

```javascript
function customMap(arr, callback) {
  // Create a new empty array to store the results.
  const newArray = [];

  // Loop through each element of the input array.
  for (let i = 0; i < arr.length; i++) {
    // Call the provided callback function for each element.
    // The callback receives the element, its index, and the original array.
    const result = callback(arr[i], i, arr);
    // Push the result of the callback into the new array.
    newArray.push(result);
  }

  // Return the new array with the transformed elements.
  return newArray;
}
```

**15. Implement `Array.prototype.filter`: Re-create the functionality of the `filter` method without using the native method.**

```javascript
function customFilter(arr, callback) {
  // Create a new empty array to store the filtered elements.
  const filteredArray = [];

  // Loop through each element of the input array.
  for (let i = 0; i < arr.length; i++) {
    // Call the provided callback function for each element.
    // The callback should return a boolean value.
    if (callback(arr[i], i, arr)) {
      // If the callback returns a truthy value, push the original element into the new array.
      filteredArray.push(arr[i]);
    }
  }

  // Return the new array containing only the elements that passed the filter.
  return filteredArray;
}
```

Of course, let's proceed with the next questions.

**16. Subarray with Given Sum: Find a contiguous subarray that adds to a given sum.**

```javascript
function subarraySum(arr, targetSum) {
  // Initialize a variable to keep track of the current subarray's sum.
  let currentSum = 0;
  // Initialize a pointer for the start of the sliding window.
  let start = 0;

  // Loop through the array with the 'end' pointer of the sliding window.
  for (let end = 0; end < arr.length; end++) {
    // Add the current element to the window's sum.
    currentSum += arr[end];

    // As long as the current sum is greater than the target and the window is valid...
    while (currentSum > targetSum && start <= end) {
      // ...shrink the window from the left by subtracting the start element.
      currentSum -= arr[start];
      // Move the start pointer to the right.
      start++;
    }

    // Check if the current sum equals the target.
    if (currentSum === targetSum) {
      // If it does, return the subarray found.
      // We slice from the start index to the end index + 1.
      return arr.slice(start, end + 1);
    }
  }

  // If no such subarray is found after checking all possibilities, return null or an empty array.
  return null;
}
```

**17. Intersection of Two Arrays: Find the common elements between two arrays.**

```javascript
function findIntersection(arr1, arr2) {
  // Create a Set from the first array for efficient, O(1) average time complexity lookups.
  const set1 = new Set(arr1);
  // Create an empty array to store the common elements.
  const intersection = [];

  // Loop through the second array.
  for (const num of arr2) {
    // Check if the current element from arr2 exists in the Set created from arr1.
    if (set1.has(num)) {
      // If it exists, it's a common element, so add it to our result.
      intersection.push(num);
    }
  }

  // To ensure the result contains only unique common elements, convert it to a Set and back to an array.
  // This step is important if arr2 has duplicates of common numbers.
  return [...new Set(intersection)];
}
```

**18. Find All Unique Elements: Write a function that returns only the unique elements from an array.**

```javascript
function findUniqueElements(arr) {
  // A Set is a data structure that, by definition, only stores unique values.
  // We can convert the array to a Set to automatically remove all duplicates.
  const uniqueSet = new Set(arr);

  // The spread syntax (...) can be used to convert the Set back into an array.
  const uniqueArray = [...uniqueSet];

  // Return the new array containing only the unique elements.
  return uniqueArray;
}```

**19. Wave Array: Sort an array in a wave-like pattern, such that 
`arr[0] >= arr[1] <= arr[2] >= arr[3]...`.**

```javascript
function waveArray(arr) {
  // First, sort the array in ascending order.
  // This makes it easy to create the wave pattern by swapping adjacent elements.
  arr.sort((a, b) => a - b);

  // Loop through the sorted array, but only on even indices (0, 2, 4, ...).
  // We increment by 2 in each step.
  for (let i = 0; i < arr.length - 1; i += 2) {
    // Swap the element at the even index with the element at the next odd index.
    // This creates the a >= b <= c pattern.
    const temp = arr[i];
    arr[i] = arr[i + 1];
    arr[i + 1] = temp;
  }

  // Return the modified array.
  return arr;
}
```

**20. Three Sum: Find all unique triplets in the array which give the sum of zero.**

```javascript
function threeSum(nums) {
  // Create an array to store the resulting triplets.
  const result = [];
  // If the array has fewer than 3 elements, it's impossible to form a triplet.
  if (nums.length < 3) {
    return result;
  }

  // Sort the array. This is crucial for the two-pointer approach and for skipping duplicates.
  nums.sort((a, b) => a - b);

  // Loop through the array. This loop will fix one number of the potential triplet.
  for (let i = 0; i < nums.length - 2; i++) {
    // If the current number is the same as the previous one, skip it to avoid duplicate triplets.
    if (i > 0 && nums[i] === nums[i - 1]) {
      continue;
    }

    // Use the two-pointer technique for the rest of the array.
    let left = i + 1; // Left pointer starts right after the fixed number.
    let right = nums.length - 1; // Right pointer starts at the end of the array.

    // While the two pointers haven't crossed.
    while (left < right) {
      // Calculate the sum of the three numbers.
      const sum = nums[i] + nums[left] + nums[right];

      // Check if the sum is zero.
      if (sum === 0) {
        // If it is, we found a triplet. Add it to our result.
        result.push([nums[i], nums[left], nums[right]]);

        // To avoid duplicate triplets, move the pointers past any duplicate numbers.
        while (left < right && nums[left] === nums[left + 1]) left++;
        while (left < right && nums[right] === nums[right - 1]) right--;

        // Move pointers inward to look for the next potential triplet.
        left++;
        right--;
      }
      // If the sum is less than zero, we need a larger sum, so move the left pointer to the right.
      else if (sum < 0) {
        left++;
      }
      // If the sum is greater than zero, we need a smaller sum, so move the right pointer to the left.
      else {
        right--;
      }
    }
  }

  // Return the array of all unique triplets that sum to zero.
  return result;
}
```

Of course. Let's move on to the string manipulation questions.

### **String Manipulation Questions**

String-related problems are essential for frontend developers who constantly work with UI text, user input, and data formatting.

**21. Reverse a String: Write a function to reverse the characters of a given string.**

```javascript
function reverseString(str) {
  // Create an empty string to build the reversed version.
  let reversedStr = '';

  // Loop through the original string backwards, from the last character to the first.
  for (let i = str.length - 1; i >= 0; i--) {
    // Append each character to the new reversed string.
    reversedStr += str[i];
  }

  // Return the fully reversed string.
  return reversedStr;
}
```

**22. Valid Palindrome: Check if a given string is a palindrome, ignoring non-alphanumeric characters and case.**

```javascript
function isPalindrome(s) {
  // First, clean the string:
  // 1. Convert to lowercase to ignore case.
  // 2. Remove all non-alphanumeric characters using a regular expression.
  // The regex /[^a-z0-9]/g matches any character that is NOT a lowercase letter or a digit.
  const cleanedStr = s.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Initialize two pointers, one at the beginning and one at the end of the cleaned string.
  let left = 0;
  let right = cleanedStr.length - 1;

  // Loop as long as the left pointer is to the left of the right pointer.
  while (left < right) {
    // Compare the characters at the left and right pointers.
    if (cleanedStr[left] !== cleanedStr[right]) {
      // If they don't match at any point, it's not a palindrome.
      return false;
    }

    // Move the pointers inward for the next comparison.
    left++;
    right--;
  }

  // If the loop completes without finding any mismatches, it is a palindrome.
  return true;
}
```

**23. Valid Anagram: Determine if two strings are anagrams of each other.**

```javascript
function isAnagram(s, t) {
  // Anagrams must have the same length. If they don't, they can't be anagrams.
  if (s.length !== t.length) {
    return false;
  }

  // Create a frequency map (using an object) to count characters in the first string.
  const charCount = {};

  // Loop through the first string to build the frequency map.
  for (const char of s) {
    // For each character, increment its count. If it's not in the map, initialize it to 1.
    charCount[char] = (charCount[char] || 0) + 1;
  }

  // Loop through the second string to check against the map.
  for (const char of t) {
    // If a character from the second string is not in the map, or its count is zero,
    // it means the strings can't be anagrams.
    if (!charCount[char]) {
      return false;
    }
    // Decrement the count for the character found.
    charCount[char]--;
  }

  // If the loop completes, it means every character in `t` was accounted for in `s`.
  // Since we already checked that the lengths are equal, they must be anagrams.
  return true;
}
```

**24. Longest Substring Without Repeating Characters: Find the length of the longest substring without any repeating characters.**

```javascript
function lengthOfLongestSubstring(s) {
  // Initialize the length of the longest substring found so far.
  let maxLength = 0;
  // Initialize the starting pointer of our sliding window.
  let start = 0;
  // Use a Map to store the most recent index of each character in the current window.
  const charIndexMap = new Map();

  // Loop through the string with the 'end' pointer of our sliding window.
  for (let end = 0; end < s.length; end++) {
    // Get the character at the current end position.
    const currentChar = s[end];

    // Check if the current character is already in our map and its index is within the current window.
    if (charIndexMap.has(currentChar) && charIndexMap.get(currentChar) >= start) {
      // If it is, a repeat has been found.
      // Move the start of our window to the position right after the last occurrence of this character.
      start = charIndexMap.get(currentChar) + 1;
    }

    // Update the map with the current character's latest position.
    charIndexMap.set(currentChar, end);

    // Calculate the length of the current window (end - start + 1).
    const currentLength = end - start + 1;
    
    // Update the maximum length if the current window is longer.
    maxLength = Math.max(maxLength, currentLength);
  }

  // Return the maximum length found.
  return maxLength;
}
```

**25. Valid Parentheses: Check if a string of brackets `(`, `)`, `{`, `}`, `[` and `]` is balanced.**

```javascript
function isValidParentheses(s) {
  // Use an array as a stack to keep track of opening brackets.
  const stack = [];
  // Create a map to hold the matching pairs of brackets.
  const bracketMap = {
    '(': ')',
    '{': '}',
    '[': ']'
  };

  // Loop through each character of the input string.
  for (const char of s) {
    // If the character is an opening bracket (i.e., a key in our map)...
    if (bracketMap[char]) {
      // ...push it onto the stack.
      stack.push(char);
    } 
    // Otherwise, it must be a closing bracket.
    else {
      // If the stack is empty, there's no opening bracket to match this closing one.
      if (stack.length === 0) {
        return false;
      }
      // Pop the last opening bracket from the stack.
      const lastOpen = stack.pop();
      // Check if the current closing bracket is the correct match for the last opening one.
      if (bracketMap[lastOpen] !== char) {
        // If it's not a match, the string is not balanced.
        return false;
      }
    }
  }

  // After the loop, if the stack is empty, all brackets were correctly matched and closed.
  // If the stack is not empty, it means there are unclosed opening brackets.
  return stack.length === 0;
}
```

Of course. I will continue providing answers until all 50 questions are completed.

**26. String to Integer (atoi): Implement a function that converts a string to an integer.**

```javascript
function myAtoi(s) {
  // Use JavaScript's built-in parseInt function, which is designed for this exact purpose.
  // It handles whitespace, signs (+/-), and stops parsing when it hits a non-numeric character.
  const integer = parseInt(s, 10); // The 10 is the radix, specifying base-10.

  // parseInt returns NaN (Not a Number) if the first non-whitespace character can't be converted.
  // We'll return 0 in that case, as is common for atoi implementations.
  if (isNaN(integer)) {
    return 0;
  }

  // Define the 32-bit signed integer limits.
  const INT_MAX = 2**31 - 1;
  const INT_MIN = -(2**31);

  // Clamp the result to the 32-bit signed integer range.
  if (integer > INT_MAX) {
    return INT_MAX;
  }
  if (integer < INT_MIN) {
    return INT_MIN;
  }

  // Return the parsed and clamped integer.
  return integer;
}
```

**27. Implement `strStr()`: Find the first occurrence of a "needle" string within a "haystack" string.**

```javascript
function strStr(haystack, needle) {
  // If the needle is an empty string, it's considered to be found at the start.
  if (needle.length === 0) {
    return 0;
  }

  // If the haystack is shorter than the needle, the needle can't be inside it.
  if (haystack.length < needle.length) {
    return -1;
  }

  // Loop through the haystack. We only need to go as far as it's possible for the needle to fit.
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    // Assume we have found a match until proven otherwise.
    let matchFound = true;
    // Check if the substring of haystack starting at `i` matches the needle.
    for (let j = 0; j < needle.length; j++) {
      // If any character doesn't match...
      if (haystack[i + j] !== needle[j]) {
        // ...it's not a match. Break the inner loop.
        matchFound = false;
        break;
      }
    }
    // If the inner loop completed without finding a mismatch...
    if (matchFound) {
      // ...we have found the needle's first occurrence. Return its starting index.
      return i;
    }
  }

  // If the loop finishes without returning, the needle was not found.
  return -1;
}```

**28. Longest Common Prefix: Find the longest common prefix string amongst an array of strings.**

```javascript
function longestCommonPrefix(strs) {
  // If the input array is empty, there's no common prefix.
  if (!strs || strs.length === 0) {
    return "";
  }

  // Start by assuming the first string is the entire common prefix.
  let prefix = strs[0];

  // Loop through the rest of the strings in the array, starting from the second one.
  for (let i = 1; i < strs.length; i++) {
    // Keep shortening the prefix until it's found at the beginning of the current string.
    // The `indexOf` method returns 0 if the substring is found at the start.
    while (strs[i].indexOf(prefix) !== 0) {
      // If not found at the start, shorten the prefix by removing the last character.
      prefix = prefix.substring(0, prefix.length - 1);
      // If the prefix becomes empty, there's no common prefix at all.
      if (prefix === "") {
        return "";
      }
    }
  }

  // The remaining prefix is the longest one common to all strings.
  return prefix;
}
```

**29. Count Vowels: Write a function that counts the number of vowels in a string.**

```javascript
function countVowels(str) {
  // Initialize a counter for the vowels.
  let vowelCount = 0;
  // Define a string containing all vowels (both cases) for easy lookup.
  const vowels = "aeiouAEIOU";

  // Loop through each character of the input string.
  for (const char of str) {
    // Check if the current character is included in our vowels string.
    if (vowels.includes(char)) {
      // If it is, increment the counter.
      vowelCount++;
    }
  }

  // Return the total count.
  return vowelCount;
}
```

**30. Capitalize Words: Create a function that capitalizes the first letter of each word in a sentence.**

```javascript
function capitalizeWords(sentence) {
  // Split the sentence into an array of words.
  const words = sentence.split(' ');

  // Loop through each word in the array.
  for (let i = 0; i < words.length; i++) {
    // Get the current word.
    const word = words[i];
    // Check if the word is not empty.
    if (word.length > 0) {
      // Create the capitalized version:
      // - Take the first character and make it uppercase.
      // - Take the rest of the word (from the second character onwards).
      // - Concatenate them back together.
      words[i] = word[0].toUpperCase() + word.substring(1);
    }
  }

  // Join the words back into a single string, separated by spaces.
  return words.join(' ');
}
```

**31. String Compression: Implement a method to perform basic string compression using the counts of repeated characters (e.g., "aabcccccaaa" would become "a2b1c5a3").**

```javascript
function compressString(str) {
  // If the string is empty, return an empty string.
  if (str.length === 0) {
    return "";
  }

  // Initialize an empty string to build the compressed result.
  let compressed = '';
  // Initialize a counter for the current character sequence.
  let count = 1;

  // Loop through the string.
  for (let i = 0; i < str.length; i++) {
    // Check if the current character is the same as the next one.
    if (str[i] === str[i + 1]) {
      // If it is, just increment the counter.
      count++;
    } else {
      // If it's different (or we're at the end of the string),
      // append the character and its count to the result.
      compressed += str[i] + count;
      // Reset the counter for the next new character.
      count = 1;
    }
  }

  // The problem often states to return the original string if the compressed one isn't shorter.
  return compressed.length < str.length ? compressed : str;
}
```

**32. Template Literals: Explain the use and benefits of template literals for string formatting in ES6.**

**Answer:**

Template literals are a feature introduced in ES6 that provide a more powerful and readable way to create strings in JavaScript. They are enclosed by backticks (`` ` ``) instead of single or double quotes.

**Key Uses and Benefits:**

1.  **Easier String Interpolation:** You can embed variables and expressions directly into the string using the `${expression}` syntax. This is much cleaner and more intuitive than traditional string concatenation with the `+` operator.

    *   **Old Way (Concatenation):**
        ```javascript
        var name = "Alex";
        var message = "Hello, " + name + "! Welcome to our site.";
        ```
    *   **New Way (Template Literal):**
        ```javascript
        const name = "Alex";
        const message = `Hello, ${name}! Welcome to our site.`;
        ```

2.  **Multi-line Strings:** Template literals allow you to create strings that span multiple lines without needing special characters like `\n`. The line breaks inside the backticks are preserved in the final string.

    *   **Old Way:**
        ```javascript
        var html = '<div>\n' +
                   '  <h1>Title</h1>\n' +
                   '</div>';
        ```
    *   **New Way:**
        ```javascript
        const html = `
          <div>
            <h1>Title</h1>
          </div>
        `;
        ```

3.  **Tagged Templates (Advanced):** This is a more advanced feature where you can pass a template literal to a function. The function receives the string parts and the interpolated values, allowing you to parse and manipulate the string in custom ways. This is used in libraries like `styled-components` in React.

In summary, template literals make code more readable, reduce errors from complex concatenation, and simplify the creation of multi-line strings, which is very common in frontend development for tasks like creating HTML templates.

---
### **Object-Related Questions**

**33. Deep Clone an Object: Write a function to create a deep copy of a JavaScript object, handling nested objects and arrays.**

```javascript
function deepClone(obj) {
  // Handle primitive types and null. If it's not an object, it doesn't need cloning.
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Determine if the object is an array or a regular object and create the initial copy.
  const clone = Array.isArray(obj) ? [] : {};

  // Iterate over all the keys in the original object.
  for (const key in obj) {
    // Ensure the key belongs to the object itself, not its prototype chain.
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      // Get the value of the property.
      const value = obj[key];
      // Recursively call deepClone on the value.
      // If the value is an object or array, it will be cloned.
      // If it's a primitive, it will be returned as is by the base case.
      clone[key] = deepClone(value);
    }
  }

  // Return the fully cloned object.
  return clone;
}
```

**34. Shallow vs. Deep Copy: Explain the difference between a shallow copy and a deep copy of an object.**

**Answer:**

The difference between a shallow and a deep copy lies in how they handle nested objects and arrays.

*   **Shallow Copy:**
    A shallow copy creates a new object, but it only copies the properties of the original object at the top level. If a property's value is a primitive type (like a number or string), the value is copied. However, if a property's value is a reference to another object or array, only the **reference** (the memory address) is copied, not the nested object itself.

    **Implication:** Both the original object and its shallow copy will point to the *exact same* nested object. If you modify the nested object through the copy, the change will also be reflected in the original object, and vice-versa.

    *   **Example (Shallow Copy):**
        ```javascript
        const original = { a: 1, b: { c: 2 } };
        const shallowCopy = { ...original }; // or Object.assign({}, original)

        shallowCopy.b.c = 99; // Modify the nested object in the copy

        console.log(original.b.c); // Output: 99 (The original is also changed!)
        ```

*   **Deep Copy:**
    A deep copy creates a new object and recursively copies every property and nested object. It does not copy references. It creates a completely new version of every nested object and array, so the copy is fully independent of the original.

    **Implication:** The copy and the original are completely disconnected. Modifying a nested object in the copy will have no effect on the original object.

    *   **Example (Deep Copy):**
        ```javascript
        const original = { a: 1, b: { c: 2 } };
        // Using our deepClone function from the previous question
        const deepCo = deepClone(original);

        deepCopy.b.c = 99; // Modify the nested object in the copy

        console.log(original.b.c); // Output: 2 (The original remains unchanged)
        ```

**In summary:** Use a shallow copy when your object only contains primitive values or when you intentionally want to share nested objects. Use a deep copy when you need a completely independent replica of an object, including all its nested parts.

**35. Merge Two Objects: Combine two objects into one.**

```javascript
function mergeObjects(obj1, obj2) {
  // The spread syntax (...) is the most modern and common way to merge objects.
  // It creates a new object and copies the properties from obj1 first,
  // then copies the properties from obj2.
  // If there are any overlapping keys, the value from the last object (obj2) wins.
  const mergedObject = { ...obj1, ...obj2 };

  // Return the new merged object.
  return mergedObject;
}

// Example:
// const user = { name: "John", role: "Developer" };
// const details = { role: "Senior Developer", location: "New York" };
// const merged = mergeObjects(user, details);
// console.log(merged); // { name: "John", role: "Senior Developer", location: "New York" }
```

**36. Check if an Object Contains a Property: How do you reliably check if an object has a specific property?**

**Answer:**

The most reliable way to check if an object has a specific property *directly on itself* (and not inherited from its prototype) is to use the `Object.prototype.hasOwnProperty.call()` method.

```javascript
const person = {
  name: 'Sarah',
  age: 30
};

// Create an object that inherits from person
const child = Object.create(person);
child.toy = 'Teddy Bear';

// --- Using hasOwnProperty ---

// GOOD: Checks for properties directly on the object.
console.log(Object.prototype.hasOwnProperty.call(child, 'toy'));   // true (toy is its own property)
console.log(Object.prototype.hasOwnProperty.call(child, 'name'));  // false (name is inherited)

// --- Why not other methods? ---

// 1. Simple dot notation or bracket notation (obj.prop or obj['prop'])
// This is unreliable because the property could exist but have a "falsy" value
// like undefined, null, false, 0, or an empty string.
if (person.age) { /* This code runs */ }
const anotherPerson = { age: 0 };
if (anotherPerson.age) { /* This code DOES NOT run, even though 'age' exists */ }


// 2. The `in` operator
// The `in` operator returns true if the property exists anywhere in the object's
// prototype chain. This is often not what you want.
console.log('toy' in child);  // true
console.log('name' in child); // true (This is true because it found 'name' on the prototype)
```

**Conclusion:** For most cases where you want to check for a key you added to an object yourself, `Object.prototype.hasOwnProperty.call(object, 'property')` is the safest and most precise method.

**37. Deep Object Comparison: Write a function to check if two objects are equal in value (deep equality).**

```javascript
function deepEqual(obj1, obj2) {
  // Check if the two items are strictly the same instance.
  // This handles primitives and the case where obj1 and obj2 are the same object.
  if (obj1 === obj2) {
    return true;
  }

  // Check if either is not an object or is null. If so, they can't be deeply equal.
  // This check is important because `typeof null` is 'object'.
  if (obj1 === null || typeof obj1 !== 'object' || obj2 === null || typeof obj2 !== 'object') {
    return false;
  }

  // Get the keys of both objects.
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  // If they don't have the same number of keys, they can't be equal.
  if (keys1.length !== keys2.length) {
    return false;
  }

  // Iterate over the keys of the first object.
  for (const key of keys1) {
    // Check if the second object also has this key.
    if (!keys2.includes(key)) {
      return false;
    }
    // Recursively call deepEqual on the values of the current key.
    // If any nested comparison returns false, the objects are not equal.
    if (!deepEqual(obj1[key], obj2[key])) {
      return false;
    }
  }

  // If all keys and their corresponding values passed the checks, the objects are deeply equal.
  return true;
}
```

**38. Add Dynamic Key-Value Pairs: Demonstrate how to add properties to an object where the key is a variable.**

**Answer:**

You can add a property to an object using a variable as the key by using **computed property names** with bracket notation `[]`.

```javascript
// The object we want to add a property to.
const userProfile = {
  id: 123,
  username: 'flynn'
};

// The variable that holds the key name we want to add.
const newPropertyName = 'country';

// The value we want to assign to the new property.
const propertyValue = 'USA';

// Use bracket notation to add the dynamic key-value pair.
userProfile[newPropertyName] = propertyValue;

// The object is now updated.
console.log(userProfile);
// Output: { id: 123, username: 'flynn', country: 'USA' }

// You can also use computed property names directly when creating an object.
const dynamicKey = 'email';
const userWithEmail = {
  name: 'Alice',
  [dynamicKey]: 'alice@example.com'
};
console.log(userWithEmail);
// Output: { name: 'Alice', email: 'alice@example.com' }
```

**39. `JSON.stringify` Usage: Explain what `JSON.stringify` does and its common use cases.**

**Answer:**

`JSON.stringify()` is a JavaScript method that converts a JavaScript object or value into a JSON (JavaScript Object Notation) string.

**What it does:**
It takes a JavaScript object, array, or primitive value as input and returns a string representation of it. This process is often called **serialization**. The resulting string follows the JSON format rules, which is a universal, language-independent data format.

*   Objects are converted to `{"key": "value"}` strings.
*   Arrays are converted to `[1, "hello", null]` strings.
*   `undefined`, functions, and symbols are ignored or converted to `null` when found inside an object or array.

**Common Use Cases:**

1.  **Sending Data to a Server (API Requests):** This is the most common use case. When you send data from a frontend application to a backend server (e.g., in the body of a `POST` or `PUT` request), the data must be in a string format. `JSON.stringify` converts your JavaScript state object into a JSON string that can be included in the HTTP request.

    ```javascript
    const userData = { name: "Sam", level: 99 };
    fetch('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // The body must be a string.
      body: JSON.stringify(userData),
    });
    ```

2.  **Storing Data in `localStorage` or `sessionStorage`:** The browser's web storage APIs can only store strings. To store a complex object or array, you must first serialize it with `JSON.stringify`. When you retrieve it, you must parse it back into an object with `JSON.parse()`.

    ```javascript
    // Storing data
    const settings = { theme: 'dark', notifications: true };
    localStorage.setItem('userSettings', JSON.stringify(settings));

    // Retrieving data later
    const storedSettings = localStorage.getItem('userSettings'); // This is a string
    const settingsObject = JSON.parse(storedSettings); // Now it's an object again
    console.log(settingsObject.theme); // "dark"
    ```

3.  **Deep-Cloning (Simple Cases):** A common "trick" for deep-cloning an object is to stringify it and then parse it. This works for simple objects that contain only JSON-safe values (no `undefined`, functions, `Date` objects, etc.).

    ```javascript
    const original = { a: 1, b: { c: 2 } };
    const clone = JSON.parse(JSON.stringify(original));
    ```

**40. Object Destructuring: Demonstrate how to use object destructuring to extract properties from an object.**

**Answer:**

Object destructuring is an ES6 feature that provides a concise way to extract values from objects and arrays and assign them to variables.

```javascript
const user = {
  id: 42,
  is_verified: true,
  data: {
    firstName: 'John',
    lastName: 'Doe',
    location: {
      city: 'New York',
      country: 'USA'
    }
  }
};

// --- Basic Destructuring ---
// Extracts firstName and lastName from user.data into variables with the same name.
const { firstName, lastName } = user.data;
console.log(firstName); // "John"
console.log(lastName);  // "Doe"


// --- Renaming Variables ---
// Extracts the 'city' property but renames the variable to 'userCity'.
const { city: userCity } = user.data.location;
console.log(userCity); // "New York"


// --- Providing Default Values ---
// Tries to extract 'role'. Since it doesn't exist, it uses the default value 'Guest'.
const { role = 'Guest' } = user.data;
console.log(role); // "Guest"


// --- Nested Destructuring ---
// A more advanced pattern to extract from nested objects in one go.
// Extracts 'city' and renames 'country' to 'userCountry' from the nested location object.
const { location: { city, country: userCountry } } = user.data;
console.log(city);        // "New York"
console.log(userCountry); // "USA"


// --- Using in Function Parameters ---
// Destructuring is very useful for cleanly accessing properties from an options object.
function showUser({ data: { firstName, lastName } }) {
  console.log(`User: ${firstName} ${lastName}`);
}
showUser(user); // "User: John Doe"
```

**41. The `in` operator vs. `hasOwnProperty`: Explain the difference between these two methods for checking property existence.**

**Answer:**

Both the `in` operator and the `hasOwnProperty` method are used to check for the existence of a property on an object, but they differ in one critical aspect: **the prototype chain**.

*   **`in` operator:**
    The `in` operator checks if a property exists on an object **or anywhere in its prototype chain**. It returns `true` if the property is found on the object itself or on any of its ancestors.

*   **`hasOwnProperty`:**
    The `hasOwnProperty` method checks if a property exists **directly on the object itself**. It returns `true` only if the property is a "direct" or "own" property of the object and is not inherited from the prototype chain.

**Example Demonstration:**

```javascript
// Create a "parent" object
const parent = {
  parentProp: 'I am from the parent'
};

// Create a "child" object that inherits from the parent
const child = Object.create(parent);
child.childProp = 'I am from the child';

// --- Check for child's own property ---
console.log('childProp' in child);                    // true (found on child)
console.log(child.hasOwnProperty('childProp'));       // true (found on child)

// --- Check for inherited property ---
console.log('parentProp' in child);                   // true (found on the prototype chain)
console.log(child.hasOwnProperty('parentProp'));      // false (this is the key difference)

// --- Check for non-existent property ---
console.log('nonExistentProp' in child);              // false
console.log(child.hasOwnProperty('nonExistentProp')); // false
```

**Conclusion:**

*   Use `in` when you don't care where the property comes from and just want to know if you can access `obj.prop` without an error.
*   Use `hasOwnProperty` (the more common case) when you need to iterate over an object's keys and want to ignore any inherited properties. This is crucial for preventing unintended behavior from modified or extended object prototypes.

**42. `Object.keys`, `Object.values`, and `Object.entries`: Describe the purpose and return value of each of these methods.**

**Answer:**

These three static methods on the `Object` constructor are used to extract an object's properties into an array format, which is very useful for iteration. They all operate only on an object's **own enumerable properties** (ignoring inherited ones).

*   **`Object.keys(obj)`:**
    *   **Purpose:** To get an array of an object's property keys (the names of the properties).
    *   **Return Value:** An array of strings.
    *   **Example:**
        ```javascript
        const car = { make: 'Toyota', model: 'Camry', year: 2021 };
        const keys = Object.keys(car);
        console.log(keys); // ['make', 'model', 'year']
        ```

*   **`Object.values(obj)`:**
    *   **Purpose:** To get an array of an object's property values.
    *   **Return Value:** An array containing the values of the properties. The data types of the elements will match the data types of the values.
    *   **Example:**
        ```javascript
        const car = { make: 'Toyota', model: 'Camry', year: 2021 };
        const values = Object.values(car);
        console.log(values); // ['Toyota', 'Camry', 2021]
        ```

*   **`Object.entries(obj)`:**
    *   **Purpose:** To get an array of an object's key-value pairs.
    *   **Return Value:** An array of arrays, where each inner array is a `[key, value]` pair.
    *   **Example:**
        ```javascript
        const car = { make: 'Toyota', model: 'Camry', year: 2021 };
        const entries = Object.entries(car);
        console.log(entries);
        // [
        //   ['make', 'Toyota'],
        //   ['model', 'Camry'],
        //   ['year', 2021]
        // ]
        ```

This method is particularly useful with `for...of` loops and destructuring for easy iteration over both the key and value simultaneously:
```javascript
for (const [key, value] of Object.entries(car)) {
  console.log(`${key}: ${value}`);
}
```

**43. Create a function to transform object values: For example, write a function that takes an object and multiplies all of its numeric property values by two.**

```javascript
function transformNumericValues(obj) {
  // Create a new object to store the transformed data, to avoid modifying the original object (immutability).
  const newObj = {};

  // Iterate over the keys of the input object.
  for (const key in obj) {
    // Check if the key is an "own" property of the object.
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      // Get the value associated with the key.
      const value = obj[key];

      // Check if the value is of the 'number' type.
      if (typeof value === 'number') {
        // If it's a number, multiply it by 2 and assign it to the new object.
        newObj[key] = value * 2;
      } else {
        // If it's not a number, just copy the original value over.
        newObj[key] = value;
      }
    }
  }

  // Return the new object with the transformed values.
  return newObj;
}

// Example:
// const data = { a: 1, b: 'hello', c: 5, d: false, e: 10 };
// const transformedData = transformNumericValues(data);
// console.log(transformedData); // { a: 2, b: 'hello', c: 10, d: false, e: 20 }
```

**44. Explain `this` in the context of an object's method.**

**Answer:**

In JavaScript, the `this` keyword is a special identifier whose value is determined by how a function is called. This is known as the **call-site**. In the context of an object's method, `this` most commonly refers to **the object that the method was called on**.

It essentially provides a way for a method to access other properties of the object it belongs to.

**Standard Function in a Method:**

When a regular function `function() {}` is used as a method, `this` refers to the object to the left of the dot (`.`) at the time of the call.

```javascript
const user = {
  name: 'Leo',
  // This is a method on the 'user' object.
  greet: function() {
    // Because greet() was called as user.greet(), 'this' inside greet refers to 'user'.
    console.log(`Hello, my name is ${this.name}.`);
  }
};

user.greet(); // Output: Hello, my name is Leo.
```

**Arrow Functions in a Method:**

Arrow functions `() => {}` behave differently. They do not have their own `this` binding. Instead, they **lexically inherit** `this` from their surrounding (parent) scope at the time they are defined.

This makes them unsuitable for top-level methods on an object if you need to access the object's properties, because their surrounding scope is often the global scope (`window` in browsers).

```javascript
const userWithArrow = {
  name: 'Mia',
  // Arrow functions inherit 'this' from their parent scope.
  // Here, the parent scope is the global scope where 'userWithArrow' is defined.
  // The global 'this.name' is likely undefined.
  sayName: () => {
    console.log(`My name is ${this.name}.`);
  }
};

userWithArrow.sayName(); // Output: My name is undefined. (or the global name, if set)
```

**Conclusion:** When defining a method on an object that needs to refer to the object itself, **always use a standard function declaration (`function() {}`) or the shorthand method syntax** (`greet() {}`), not an arrow function.

```javascript
const person = {
  name: 'Zoe',
  // Shorthand method syntax also works correctly.
  introduce() {
    console.log(`I'm ${this.name}.`); // 'this' correctly refers to 'person'
  }
};
person.introduce(); // Output: I'm Zoe.
```

---
### **Frontend-Specific Application Problems**

**45. Implement a Debounce Function: Write a debounce function from scratch, which is critical for performance in handling events like search input or window resizing.**

```javascript
function debounce(func, delay) {
  // This variable will hold the timer ID. It's kept in the closure.
  let timeoutId;

  // The debounce function returns a new function.
  // This new function is what will actually be called by the event listener.
  return function(...args) {
    // 'this' will be the context of how the debounced function is called.
    // 'args' will be the arguments passed to it.
    const context = this;

    // Whenever the returned function is called, clear the previous timer.
    // This cancels the previously scheduled execution of 'func'.
    clearTimeout(timeoutId);

    // Set a new timer.
    // The original function 'func' will be called after the 'delay' has passed.
    timeoutId = setTimeout(() => {
      // Use .apply() to call the original function with the correct 'this' context and arguments.
      func.apply(context, args);
    }, delay);
  };
}

// --- HOW TO USE IT ---
// const searchInput = document.getElementById('search');
//
// // The function we want to debounce.
// const handleSearch = (event) => {
//   console.log('Searching for:', event.target.value);
// };
//
// // Create the debounced version of our handler.
// // The API call will only happen 250ms after the user stops typing.
// const debouncedSearch = debounce(handleSearch, 250);
//
// // Attach the debounced function as the event listener.
// searchInput.addEventListener('input', debouncedSearch);
```

**46. Implement a Throttle Function: Write a throttle function to limit the execution of a function to once every specified period, often used for scroll or mouse-move events.**

```javascript
function throttle(func, limit) {
  // This variable tracks whether we are currently in a "cooldown" period.
  let inThrottle;
  // This variable will hold the timer ID.
  let timeoutId;

  // The throttle function returns a new function.
  return function(...args) {
    // Capture the context and arguments.
    const context = this;

    // If we are not in the cooldown period...
    if (!inThrottle) {
      // ...execute the function immediately.
      func.apply(context, args);
      // ...enter the cooldown period.
      inThrottle = true;
      // ...and set a timer to exit the cooldown period after the specified limit.
      timeoutId = setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

// --- HOW TO USE IT ---
// const handleScroll = () => {
//   console.log('User scrolled! Performing some heavy calculation.');
// };
//
// // Throttle the scroll handler to only run once every 100 milliseconds.
// // This prevents the heavy calculation from running hundreds of times during a single scroll gesture.
// const throttledScrollHandler = throttle(handleScroll, 100);
//
// window.addEventListener('scroll', throttledScrollHandler);
```

**47. Implement an LRU Cache: Design and implement a Least Recently Used (LRU) cache, commonly used for caching API responses.**

**Answer:**

An LRU (Least Recently Used) Cache is a data structure that stores a limited number of items. When it's full and a new item needs to be added, it discards the item that was accessed the longest time ago.

We can implement this efficiently using a `Map` in JavaScript. A `Map` maintains the insertion order of its keys, which we can leverage to track which key is the least recently used.

```javascript
class LRUCache {
  // The constructor initializes the cache with a maximum capacity.
  constructor(capacity) {
    this.capacity = capacity; // The maximum number of items the cache can hold.
    this.cache = new Map();   // The Map will store our key-value pairs.
  }

  // get(key): Retrieves an item from the cache.
  get(key) {
    // If the key does not exist in the cache, return -1.
    if (!this.cache.has(key)) {
      return -1;
    }

    // --- This is the core "recently used" logic ---
    // Get the value associated with the key.
    const value = this.cache.get(key);
    // Delete the key-value pair from its current position in the map.
    this.cache.delete(key);
    // Re-insert the key-value pair. Because Map preserves insertion order,
    // this effectively moves the key to the "end" of the map, marking it as most recently used.
    this.cache.set(key, value);

    // Return the value.
    return value;
  }

  // put(key, value): Adds or updates an item in the cache.
  put(key, value) {
    // If the key already exists, we just need to update its value and mark it as recently used.
    // Deleting it first is the easiest way to handle this before re-inserting it.
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // Check if the cache is at full capacity.
    else if (this.cache.size >= this.capacity) {
      // The cache is full, so we must evict the least recently used item.
      // In a Map, the first item is the oldest (least recently inserted/used).
      // `this.cache.keys()` returns an iterator. `.next().value` gets the first key.
      const leastRecentlyUsedKey = this.cache.keys().next().value;
      // Delete the oldest item.
      this.cache.delete(leastRecentlyUsedKey);
    }

    // Add the new key-value pair to the cache. It becomes the most recently used item.
    this.cache.set(key, value);
  }
}

// --- HOW TO USE IT ---
// const myCache = new LRUCache(2); // Create a cache with a capacity of 2
// myCache.put(1, 'A'); // Cache is {1: 'A'}
// myCache.put(2, 'B'); // Cache is {1: 'A', 2: 'B'}
// console.log(myCache.get(1)); // Returns 'A'. Cache is now {2: 'B', 1: 'A'} (1 is most recent)
// myCache.put(3, 'C'); // Cache is full. Evicts key 2. Cache is {1: 'A', 3: 'C'}
// console.log(myCache.get(2)); // Returns -1 (was evicted)
```

**48. Implement `curry()`: Write a function that performs currying, transforming a function that takes multiple arguments into a sequence of functions that each take a single argument.**

**Answer:**

Currying is a functional programming technique. A `curry` function takes a function `fn` that accepts multiple arguments and returns a new function. This new function can be called with one argument at a time. It will keep returning new functions—each accepting one argument—until it has received all the arguments `fn` expects. At that point, it will execute the original function `fn` with all the collected arguments.

```javascript
function curry(fn) {
  // The 'curry' function returns a new "curried" function.
  // It takes an initial set of arguments.
  return function curried(...args) {
    // 'fn.length' gives the number of arguments the original function 'fn' expects.
    // If the number of arguments we've collected so far ('args.length') is enough...
    if (args.length >= fn.length) {
      // ...then execute the original function 'fn' with those arguments.
      return fn.apply(this, args);
    } else {
      // ...otherwise, we need more arguments.
      // Return a new function that will accept the *next* set of arguments ('args2').
      return function(...args2) {
        // When this inner function is called, it will call 'curried' again,
        // passing a concatenated list of the old arguments and the new ones.
        return curried.apply(this, args.concat(args2));
      };
    }
  };
}

// --- HOW TO USE IT ---
// A simple function that takes three arguments.
function sum(a, b, c) {
  return a + b + c;
}

// Create a curried version of the sum function.
const curriedSum = curry(sum);

// Now we can call it in different ways:
console.log(curriedSum(1, 2, 3)); // 6 (works like the original)
console.log(curriedSum(1)(2, 3)); // 6
console.log(curriedSum(1)(2)(3)); // 6

const add5 = curriedSum(5); // Create a new function that already has the first argument '5'.
const add5and3 = add5(3); // Create a new function that has '5' and '3'.

console.log(add5and3(10)); // 18 (5 + 3 + 10)
console.log(add5(8, 2));   // 15 (5 + 8 + 2)
```

**49. Flatten an object: Write a function that takes a nested object and returns a single-level object with dot-separated keys (e.g., `{ a: { b: 1 } }` becomes `{ 'a.b': 1 }`).**

```javascript
function flattenObject(obj) {
  // Initialize an empty object to store the flattened result.
  const flattened = {};

  // Create a recursive inner function to process the object.
  // It takes the current object and the path/prefix built so far.
  function process(currentObj, prefix) {
    // Iterate over all keys in the current object.
    for (const key in currentObj) {
      // Make sure it's an own property.
      if (Object.prototype.hasOwnProperty.call(currentObj, key)) {
        // Construct the new key by joining the prefix and the current key with a dot.
        // If there's no prefix yet, the new key is just the current key.
        const newKey = prefix ? `${prefix}.${key}` : key;
        // Get the value of the property.
        const value = currentObj[key];

        // Check if the value is a non-null object and not an array.
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // If it's another object, recurse deeper, passing the nested object and the new key as the prefix.
          process(value, newKey);
        } else {
          // If it's a primitive, an array, or null, assign the value to the new key in our result object.
          flattened[newKey] = value;
        }
      }
    }
  }

  // Start the process with the initial object and an empty prefix.
  process(obj, '');

  // Return the flattened object.
  return flattened;
}

// --- HOW TO USE IT ---
// const nested = {
//   a: 1,
//   b: {
//     c: 'hello',
//     d: {
//       e: true
//     }
//   },
//   f:
// };
//
// const flat = flattenObject(nested);
// console.log(flat);
// // Output:
// // {
// //   'a': 1,
// //   'b.c': 'hello',
// //   'b.d.e': true,
// //   'f':
// // }
```

**50. Implement Infinite Scrolling Logic: Outline the data structure and logic to manage data fetching and display for an infinite scroll feature.**

**Answer:**

Implementing infinite scrolling involves managing state, handling API calls, and listening to user scroll events. Here is an outline of the data structures and logic.

**1. State Management (Data Structures)**

You need to keep track of several pieces of state in your frontend component:

*   **`items` (Array):** This array will hold all the data items that have been fetched and are currently displayed on the page.
    *   Example: `const [items, setItems] = useState([]);`
*   **`page` (Number):** This tracks the current page number for API requests. You'll increment this to fetch the next batch of data.
    *   Example: `const [page, setPage] = useState(1);`
*   **`isLoading` (Boolean):** A flag to prevent multiple API calls from being made simultaneously. When a fetch is in progress, this should be `true`.
    *   Example: `const [isLoading, setIsLoading] = useState(false);`
*   **`hasMore` (Boolean):** A flag to indicate if there is more data to be fetched from the server. When the API returns an empty array or a specific signal, this should be set to `false` to stop trying to fetch more.
    *   Example: `const [hasMore, setHasMore] = useState(true);`

**2. Core Logic Flow**

**a. Initial Data Fetch:**
*   When the component first mounts (e.g., in a `useEffect` hook in React), make the initial API call to fetch the first page of data.
*   The `fetchData` function will be an `async` function.

**b. `fetchData` Function:**
1.  **Guard Clause:** If `isLoading` is `true` or `hasMore` is `false`, exit the function immediately.
2.  **Set Loading State:** Set `setIsLoading(true)`.
3.  **API Call:** Make an API request to your backend, including the current `page` number in the query.
    *   Example: `fetch('/api/items?page=' + page + '&limit=10')`.
4.  **Process Response:**
    *   When the data arrives, check if the returned array of new items is empty. If it is, set `setHasMore(false)`.
    *   Append the new items to your existing `items` array: `setItems(prevItems => [...prevItems, ...newItems]);`.
    *   Increment the page number for the next fetch: `setPage(prevPage => prevPage + 1);`.
5.  **Reset Loading State:** Set `setIsLoading(false)`.

**c. Scroll Event Listener:**
1.  **Attach Listener:** Attach a scroll event listener to the `window` or a specific scrollable container element. It's crucial to **throttle or debounce** this listener to avoid performance issues.
2.  **Scroll Handler Logic:** The handler function will check if the user has scrolled near the bottom of the page.
    *   The condition for this is typically: `window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - BUFFER`, where `BUFFER` is a small pixel offset (e.g., 100px) to start loading before the user hits the absolute bottom.
3.  **Trigger Fetch:** If the condition is met (and `isLoading` is false), call your `fetchData` function.

**d. Cleanup:**
*   Remember to remove the scroll event listener when the component unmounts to prevent memory leaks. This is done in the return function of a `useEffect` hook.

**3. Pseudocode Example (React-like)**

```javascript
function InfiniteScrollComponent() {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Function to fetch data from the API
  const fetchData = async () => {
    if (isLoading || !hasMore) return; // Prevent multiple fetches
    setIsLoading(true);

    const response = await fetch(`/api/items?page=${page}&limit=10`);
    const newItems = await response.json();

    if (newItems.length === 0) {
      setHasMore(false); // No more data to load
    } else {
      setItems(prev => [...prev, ...newItems]); // Append new items
      setPage(prev => prev + 1); // Go to the next page
    }

    setIsLoading(false);
  };

  // Scroll handler
  const handleScroll = () => {
    // Check if user is near the bottom
    if (window.innerHeight + document.documentElement.scrollTop < document.documentElement.offsetHeight - 100) {
      return; // Not near the bottom yet
    }
    fetchData(); // Trigger fetch
  };

  // Set up and clean up scroll listener
  useEffect(() => {
    // Initial data load
    fetchData(); 

    // Use a throttled handler for performance
    const throttledHandleScroll = throttle(handleScroll, 200);
    window.addEventListener('scroll', throttledHandleScroll);

    // Cleanup
    return () => window.removeEventListener('scroll', throttledHandleScroll);
  }, []); // Empty dependency array means this runs only on mount and unmount

  return (
    <div>
      {items.map(item => <div key={item.id}>{item.name}</div>)}
      {isLoading && <p>Loading more items...</p>}
      {!hasMore && <p>You have reached the end!</p>}
    </div>
  );
}
```

**51. Check for Balanced Brackets in a String: Given a string containing only brackets (parentheses `()`, square `[]`, and curly `{}`), determine if the brackets are balanced and properly nested.**

```javascript
function isBalanced(str) {
  // Stack to keep track of opening brackets
  const stack = [];
  // Map of opening to corresponding closing brackets
  const brackets = {
    '(': ')',
    '[': ']',
    '{': '}'
  };

  // Loop through each character in the string
  for (const char of str) {
    // If it's an opening bracket, push to stack
    if (brackets[char]) {
      stack.push(char);
    } else if (Object.values(brackets).includes(char)) {
      // If it's a closing bracket, check for a match
      if (stack.length === 0) {
        // No opening bracket to match
        return false;
      }
      const lastOpen = stack.pop();
      if (brackets[lastOpen] !== char) {
        // Mismatched closing bracket
        return false;
      }
    }
    // Ignore any non-bracket characters (optional, based on requirements)
  }

  // If stack is empty, all brackets were matched
  return stack.length === 0;
}

// Example usage:
let testS = "[{([])}]{}()"; // true
console.log("isBalanced:", isBalanced(testS));

let testS2 = "[{]}"; // false
console.log("isBalanced:", isBalanced(testS2));
```

# 1. Implement Debounce (Easy)  
**Debounce** ensures that a function is **only called after a certain period of inactivity**. If the function is invoked again before the delay elapses, the previous call is canceled and the timer resets. This is useful for rate-limiting events like resize or keypress so the function executes only after the user stops triggering the event for the specified delay.

**Solution:** Create a wrapper function that manages a timer. Each time the wrapper is called, clear any existing timer and set a new one. Only when the timer completes (meaning no new call happened during the delay) will the original function execute.  

```js
function debounce(fn, delay) {
  let timerId;
  return function (...args) {
    // Clear previous timer if function is called again within the delay
    if (timerId) {
      clearTimeout(timerId);
    }
    // Set a new timer for the function call
    timerId = setTimeout(() => {
      fn.apply(this, args);  // Execute the original function after delay
    }, delay);
  };
}
```

**Example Usage:**  
```js
function onResize() {
  console.log("Window resized");
}
window.addEventListener('resize', debounce(onResize, 500));
```  
In this example, `onResize` will log "Window resized" only **after the window resizes and stays unchanged for 500ms**. Rapid resize events will result in the function being called just once when resizing stops.

<br/>

# 2. Implement Throttle (Medium)  
**Throttle** ensures a function is **called at most once in a specified period**, ignoring additional calls during that period. This is useful for controlling events that fire very frequently (like scroll or mousemove) so that the handler executes at a controlled rate.

**Solution:** Maintain a flag (or timestamp) to indicate if the function can be called. Once the function is invoked, block further calls until the delay time has passed. One common approach uses a timer: if the function is called and no timer is running, call the function and start a timer. Subsequent calls during the timer are ignored. Once the timer ends, the function can be called again.

```js
function throttle(fn, delay) {
  let inThrottle = false;
  return function (...args) {
    if (!inThrottle) {
      // Call the function immediately and enter throttled state
      fn.apply(this, args);
      inThrottle = true;
      // After `delay` milliseconds, exit throttled state to allow future calls
      setTimeout(() => { 
        inThrottle = false; 
      }, delay);
    }
    // If inThrottle is true, ignore the call (do nothing)
  };
}
```

**Example Usage:**  
```js
function onScroll() {
  console.log("Scroll position:", window.scrollY);
}
window.addEventListener('scroll', throttle(onScroll, 200));
```  
Here, `onScroll` will execute at most **once every 200ms** no matter how quickly the user scrolls, preventing excessive function calls.

<br/>

# 3. Implement Currying (Easy)  
**Currying** is a transformation of a function with multiple arguments into a sequence of functions, each taking a single argument. A curried function, when given **fewer arguments than it needs**, returns a new function that expects the remaining arguments. Once it has received all its arguments, it returns the result as if the original function were called with all arguments.

**Solution:** We can implement currying by checking the number of arguments provided versus the original function’s expected number (`fn.length`). If not enough arguments are given, return a new function that collects further arguments. If enough arguments are provided, call the original function with all of them.

```js
function curry(fn) {
  return function curried(...args) {
    if (args.length >= fn.length) {
      // If enough arguments were provided, call the original function
      return fn(...args);
    } else {
      // Otherwise, return a function that collects the remaining arguments
      return function (...nextArgs) {
        return curried(...args, ...nextArgs);
      };
    }
  };
}
```

**Example Usage:**  
```js
function join(a, b, c) {
  return `${a}_${b}_${c}`;
}
const curriedJoin = curry(join);

console.log(curriedJoin(1, 2, 3));    // Output: "1_2_3"  (all args at once)
console.log(curriedJoin(1)(2, 3));    // Output: "1_2_3"  (1 then 2,3)
console.log(curriedJoin(1, 2)(3));    // Output: "1_2_3"  (1,2 then 3)
```  
Each of the above forms eventually provides all three arguments to `join`. Currying allows flexibility in how arguments are passed in over time.

<br/>

# 4. Implement Currying with Placeholders (Medium)  
Currying with **placeholder support** extends normal currying by allowing “gaps” in arguments. A **placeholder** acts as a stand-in, indicating that an argument will be provided later. This allows partial application not just from left to right but at any position.

**Solution:** We use a special placeholder value (for example, set `curry.placeholder = Symbol()`) to represent gaps. In the curried function, we consider the function’s expected argument count (`fn.length`) and placeholders when deciding to execute or return a new function. If the number of provided arguments (excluding placeholders) is enough and no placeholders remain in the first `fn.length` arguments, we execute `fn`. Otherwise, we return a function that merges new arguments into the existing ones, replacing placeholders sequentially.

```js
function curry(fn) {
  function curried(...args) {
    // Determine if all needed arguments are provided (placeholders don't count as provided)
    const enoughArgs = args.length >= fn.length &&
                       args.slice(0, fn.length).every(arg => arg !== curry.placeholder);
    if (enoughArgs) {
      return fn.apply(this, args);
    } 
    // Not enough args: return a function to gather more, merging placeholders
    return function (...nextArgs) {
      const combinedArgs = args.map(arg => 
        arg === curry.placeholder && nextArgs.length ? nextArgs.shift() : arg
      ).concat(nextArgs);
      return curried(...combinedArgs);
    };
  }
  return curried;
}
// Define a placeholder symbol:
curry.placeholder = Symbol();
```

**Example Usage:**  
```js
const _ = curry.placeholder;
function greet(greeting, title, name) {
  return `${greeting}, ${title} ${name}!`;
}
const curriedGreet = curry(greet);

const sayHelloTo = curriedGreet("Hello", _, "Smith");
console.log(sayHelloTo("Mr"));   // Output: "Hello, Mr Smith!"

const greetSir = curriedGreet("Greetings", "Sir", _);
console.log(greetSir("Lancelot")); // Output: "Greetings, Sir Lancelot!"
```  
In the first example, `"Hello"` and `"Smith"` are provided early, while the placeholder `_` reserves the spot for `"Mr"`. In the second, the placeholder reserves the last argument. The curried function can be partially applied in any order thanks to placeholders.

<br/>

# 5. Deep Flatten I (Medium)  
**Deep flattening** an array means converting an arbitrarily nested array into a single-level array containing all the values. In this first approach, we’ll implement flatten using **recursion**.

**Solution (Recursive):** Recursively traverse each element of the array. If an element is an array, flatten it (recursively) and concatenate the result; if it’s a primitive (non-array), include it directly. This approach will handle nesting of any depth.

```js
function deepFlattenRecursive(arr) {
  const result = [];
  for (let item of arr) {
    if (Array.isArray(item)) {
      // If item is an array, flatten it recursively
      result.push(...deepFlattenRecursive(item));
    } else {
      // If item is not an array, add it directly
      result.push(item);
    }
  }
  return result;
}
```

**Example Usage:**  
```js
const nested = [1, [2, [3, 4], 5], [6, 7], 8, [[9]]];
console.log(deepFlattenRecursive(nested));
// Output: [1, 2, 3, 4, 5, 6, 7, 8, 9]
```  
The nested array of various depths is fully flattened into a one-dimensional array.

<br/>

# 6. Deep Flatten II (Medium)  
In this approach, we flatten an array **without using recursion**, for example by using an iterative technique. One common method is to repeatedly use array spreading or concatenation until no nested array remains.

**Solution (Iterative):** We can check if the array still contains any array elements using `Array.isArray` (or the `some` method). While it does, use `Array.prototype.concat` with spread syntax to flatten one level. This will progressively eliminate nesting level by level.

```js
function deepFlattenIterative(arr) {
  let result = arr.slice();  // make a copy to avoid modifying original
  while (result.some(item => Array.isArray(item))) {
    result = [].concat(...result);
  }
  return result;
}
```

**Example Usage:**  
```js
const nested = [1, [2, [3, [4, 5]]], 6];
console.log(deepFlattenIterative(nested));
// Output: [1, 2, 3, 4, 5, 6]
```  
The code flattens the array step by step. After the first pass, `[3, [4, 5]]` becomes flattened, and so on, until the result is completely flat.

<br/>

# 7. Deep Flatten III (Easy)  
As an alternative, you can leverage built-in methods like ES2019’s `Array.prototype.flat()` with a high `depth` value to flatten an array in one go. This approach is straightforward when using modern JavaScript.

**Solution (Using Built-in):** Use `arr.flat(Infinity)` which flattens an array to an infinite depth (effectively completely flat). We can also demonstrate a functional recursive approach using `Array.prototype.reduce` for variety.

```js
// Using built-in flat method:
function deepFlattenBuiltIn(arr) {
  return arr.flat(Infinity);
}

// Alternatively, using reduce (recursive):
function deepFlattenReduce(arr) {
  return arr.reduce((acc, item) => {
    if (Array.isArray(item)) {
      acc = acc.concat(deepFlattenReduce(item));
    } else {
      acc.push(item);
    }
    return acc;
  }, []);
}
```

**Example Usage:**  
```js
const nested = [ [1, 2, [3]], 4, [5, [6, [7, 8]]] ];
console.log(deepFlattenBuiltIn(nested));
// Output: [1, 2, 3, 4, 5, 6, 7, 8]
console.log(deepFlattenReduce(nested));
// Output: [1, 2, 3, 4, 5, 6, 7, 8]
```  
Both approaches produce the same fully flattened result. The built-in `flat` method is succinct, while the `reduce` approach manually accumulates elements, demonstrating the underlying concept.

<br/>

# 8. Deep Flatten IV (Hard)  
For a more advanced scenario, consider flattening not just arrays but also nested **objects** – converting an object with nested structure into a single-level object with dot-delimited keys (or another notation). This is commonly asked in interviews as “flatten a JSON object”.

**Solution (Flatten Object):** Use recursion to traverse keys. If a value is an object, recursively flatten its keys (appending parent keys), otherwise assign the value directly to the result. We’ll handle arrays similarly by indexing them in keys, if needed.

```js
function flattenObject(obj, parentKey = '', result = {}) {
  for (let key in obj) {
    if (!obj.hasOwnProperty(key)) continue;
    const fullKey = parentKey ? `${parentKey}.${key}` : key;
    const value = obj[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recurse into nested objects
      flattenObject(value, fullKey, result);
    } else {
      // Assign value to the flattened key
      result[fullKey] = value;
    }
  }
  return result;
}
```

**Example Usage:**  
```js
const data = {
  name: "Alice",
  address: { 
    city: "Wonderland", 
    zip: { code: 12345, plus4: 6789 }
  }
};
console.log(flattenObject(data));
// Output: {
//   "name": "Alice",
//   "address.city": "Wonderland",
//   "address.zip.code": 12345,
//   "address.zip.plus4": 6789
// }
```  
The nested object `data` is flattened into keys like `"address.city"` and `"address.zip.code"`. This technique can be extended to flatten arrays (using indices in keys) or other data types as needed. (Ensure to handle special cases like `null` which is an object but should be treated as a value.)

<br/>

# 9. Negative Indexing in Arrays (Proxies) - Medium  
In some languages (like Python), you can use **negative indices** to access elements from the end of an array (e.g., `arr[-1]` gives the last element). We can simulate this in JavaScript using a **Proxy** to intercept array access.

**Solution:** Create a Proxy for the array that intercepts the `get` operation. If the property is a negative index (e.g., `"-1"`), translate it to `arrayLength + (negativeIndex)`.

```js
function createNegativeIndexArray(arr) {
  return new Proxy(arr, {
    get(target, prop) {
      if (typeof prop === "string") {
        // Convert prop to number (for indices)
        const index = Number(prop);
        if (!Number.isNaN(index) && index < 0) {
          // Negative index: convert to positive index from end
          const posIndex = target.length + index;
          return target[posIndex];
        }
      }
      // Default behavior for non-negative indices or other properties
      return target[prop];
    }
  });
}

// Example wrapper to easily get a negative-indexing array
function negativeArray(...elements) {
  return createNegativeIndexArray([...elements]);
}
```

**Example Usage:**  
```js
const arr = negativeArray('a', 'b', 'c', 'd');
console.log(arr[1]);   // Output: "b"   (normal indexing)
console.log(arr[-1]);  // Output: "d"   (last element)
console.log(arr[-2]);  // Output: "c"   (second from last)
```  
The Proxy intercepts the property access: for `-1` it returns `target[target.length - 1]`. This way, negative indices can be used seamlessly. Note that other array features (like `for...of` or methods) still work normally, and only the indexing operation is customized.

<br/>

# 10. Implement a Pipe Method (Easy)  
Function **composition** (or piping) allows the output of one function to become the input of the next. A `pipe` function takes a sequence of functions and returns a new function that, when called, runs the input through all of them in order.

**Solution:** The `pipe` function can accept an array of functions or a variable number of function arguments. The returned function takes an initial value and passes it through the pipeline using `Array.reduce`.

```js
function pipe(...fns) {
  return function (input) {
    return fns.reduce((value, func) => func(value), input);
  };
}
```

**Example Usage:**  
```js
const multiplyBy2 = x => x * 2;
const add3 = x => x + 3;
const subtract4 = x => x - 4;

// Create a pipeline of functions
const pipeline = pipe(multiplyBy2, add3, subtract4);

console.log(pipeline(5)); 
// Explanation: ((5 * 2) + 3) - 4
// Output: 5 (since 5*2 = 10, 10+3 = 13, 13-4 = 9)
```  
In the example, `pipe` composes `multiplyBy2`, `add3`, and `subtract4`. Calling `pipeline(5)` runs 5 through each function in sequence. The pipe utility makes it easy to create modular, reusable transformations by chaining simple functions.

<br/>

# 11. Implement Auto-retry Promises (Medium)  
Sometimes you want to **automatically retry a failing asynchronous operation** (like a network request) a certain number of times before giving up. We can implement a function that wraps a promise-returning operation in a retry mechanism.

**Solution:** Define a function `retryPromise(fn, retries, delay)` where `fn` is an async function (or function returning a promise). The function will attempt to call `fn()`. If it resolves, we return the result. If it rejects and we have retries left, wait for a given delay then try again. This can be implemented with recursion or a loop.

```js
function retryPromise(fn, retries = 3, delay = 0) {
  return new Promise((resolve, reject) => {
    // Attempt the operation
    fn()
      .then(resolve)             // If it succeeds, resolve immediately
      .catch(error => {
        if (retries <= 0) {
          // No retries left, reject with the last error
          reject(error);
        } else {
          // Retry after a delay
          setTimeout(() => {
            retryPromise(fn, retries - 1, delay).then(resolve).catch(reject);
          }, delay);
        }
      });
  });
}
```

**Example Usage:**  
```js
let attempt = 0;
function fetchData() {
  return new Promise((resolve, reject) => {
    attempt++;
    console.log(`Attempt ${attempt}`);
    // Simulate a flaky operation: succeeds on the 3rd attempt
    (attempt < 3) ? reject("Network Error") : resolve("Success!");
  });
}

// Try up to 3 times with 500ms delay between tries
retryPromise(fetchData, 3, 500)
  .then(result => console.log("Result:", result))
  .catch(err => console.error("Failed:", err));
```  
Output:
```
Attempt 1  
Attempt 2  
Attempt 3  
Result: Success!
```  
The function `retryPromise` automatically retried `fetchData` until it succeeded on the third attempt. If it had failed all tries, the final catch would have logged "Failed: [error]".

<br/>

# 12. Implement Promise.all (Medium)  
`Promise.all` takes an iterable of promises (or values) and returns a promise that **resolves when all of them resolve** (or rejects as soon as one promise rejects). The resolved value is an array of all resolved results in the original order.

**Solution:** We can implement a `promiseAll` function that accepts an array of promises. Use an array to collect results and a counter to track how many have resolved. For each promise in the input, attach a `.then` and `.catch`: on fulfillment, store the value and increment the counter; on rejection, reject the overall promise immediately. When the counter equals the number of promises, resolve the overall promise with the result array.

```js
function promiseAll(promises) {
  return new Promise((resolve, reject) => {
    const results = [];
    let fulfilledCount = 0;
    const total = promises.length;

    if (total === 0) {
      return resolve([]); // handle empty array edge-case
    }

    promises.forEach((p, index) => {
      Promise.resolve(p)  // handle if p is not already a promise
        .then(value => {
          results[index] = value;
          fulfilledCount++;
          if (fulfilledCount === total) {
            resolve(results);
          }
        })
        .catch(error => reject(error));
    });
  });
}
```

**Example Usage:**  
```js
const p1 = Promise.resolve(10);
const p2 = new Promise(res => setTimeout(res, 100, 20));
const p3 = Promise.resolve(30);

promiseAll([p1, p2, p3]).then(values => {
  console.log(values);  // Output after 100ms: [10, 20, 30]
});
```  
In this example, `promiseAll` returns a promise that fulfills with `[10, 20, 30]` once all three input promises have resolved. If any promise had rejected, `promiseAll` would immediately reject with that error and ignore later outcomes.

<br/>

# 13. Implement Promise.allSettled (Medium)  
`Promise.allSettled` returns a promise that fulfills when **all input promises have settled** (either resolved or rejected). Instead of short-circuiting on rejection, it waits for all promises and provides an array of outcome objects (`{status: "fulfilled", value: ...}` or `{status: "rejected", reason: ...}` for each input promise).

**Solution:** Similar to `Promise.all`, but we never reject early. We collect results for each promise by attaching `.then` and `.catch` that each produce an outcome object. After all promises settle, resolve with the array of results.

```js
function promiseAllSettled(promises) {
  return new Promise(resolve => {
    const results = [];
    let settledCount = 0;
    const total = promises.length;
    if (total === 0) {
      return resolve([]);
    }

    promises.forEach((p, index) => {
      Promise.resolve(p)
        .then(value => {
          results[index] = { status: "fulfilled", value: value };
        })
        .catch(reason => {
          results[index] = { status: "rejected", reason: reason };
        })
        .finally(() => {
          settledCount++;
          if (settledCount === total) {
            resolve(results);
          }
        });
    });
  });
}
```

**Example Usage:**  
```js
const p1 = Promise.resolve("OK");
const p2 = Promise.reject("Error");
const p3 = new Promise(res => setTimeout(res, 50, "Late"));

promiseAllSettled([p1, p2, p3]).then(results => {
  console.log(results);
  /* Expected output:
  [
    { status: "fulfilled", value: "OK" },
    { status: "rejected", reason: "Error" },
    { status: "fulfilled", value: "Late" }
  ]
  */
});
```  
All promises are allowed to run to completion. The result shows the status and value/reason for each promise, in the original order.

<br/>

# 14. Implement Promise.any (Medium)  
`Promise.any` returns a promise that **fulfills as soon as one of the input promises fulfills**. If all promises reject, it rejects with an `AggregateError` (an error that groups multiple errors). Essentially, it's the opposite of `Promise.all`'s rejection behavior – it ignores rejections until all are rejected.

**Solution:** We attach handlers to each promise that resolve the returned promise on the first fulfillment. We count rejections, and if the number of rejections equals the number of promises (meaning none fulfilled), we reject with an `AggregateError` containing all rejection reasons.

```js
function promiseAny(promises) {
  return new Promise((resolve, reject) => {
    const errors = [];
    let rejectCount = 0;
    const total = promises.length;
    if (total === 0) {
      // By spec, Promise.any on empty array should reject immediately
      return reject(new AggregateError([], "All promises were rejected"));
    }

    promises.forEach((p, index) => {
      Promise.resolve(p)
        .then(value => {
          // First promise to fulfill resolves the overall promise
          resolve(value);
        })
        .catch(err => {
          errors[index] = err;
          rejectCount++;
          if (rejectCount === total) {
            // All promises rejected
            reject(new AggregateError(errors, "All promises were rejected"));
          }
        });
    });
  });
}
```

**Example Usage:**  
```js
const p1 = Promise.reject("Fail 1");
const p2 = new Promise(res => setTimeout(res, 100, "Success"));
const p3 = Promise.reject("Fail 2");

promiseAny([p1, p2, p3]).then(value => {
  console.log("First fulfilled:", value);  // After 100ms: "First fulfilled: Success"
}).catch(err => {
  // This catch would run only if all promises failed
  console.error(err);
});
```  
In this example, `p2` fulfills after 100ms, so `promiseAny` resolves with `"Success"` and ignores other outcomes. If all promises had failed, it would throw an `AggregateError` listing all failure reasons.

<br/>

# 15. Implement Promise.race (Easy)  
`Promise.race` returns a promise that **settles as soon as one of the input promises settles** (fulfills or rejects). Essentially, whichever promise completes first (regardless of outcome) wins the race and its result (or error) is taken.

**Solution:** Attach fulfillment and rejection handlers to each promise that settle the returned promise immediately. Once one promise triggers either handler, we can ignore the rest. (We should ensure only the first outcome is used, but since settling a promise is one-time, subsequent calls have no effect.)

```js
function promiseRace(promises) {
  return new Promise((resolve, reject) => {
    // If promises array is empty, it stays pending forever by spec (or you could resolve undefined).
    promises.forEach(p => {
      Promise.resolve(p).then(resolve, reject);
    });
  });
}
```

**Example Usage:**  
```js
const p1 = new Promise(res => setTimeout(res, 500, "Slow"));
const p2 = new Promise((_, rej) => setTimeout(rej, 100, "FastError"));

promiseRace([p1, p2])
  .then(val => console.log("Winner:", val))
  .catch(err => console.log("Winner (error):", err));
```  
In the above, `p2` rejects after 100ms and `p1` would resolve after 500ms. `promiseRace` will settle after 100ms with `p2`’s outcome because `p2` finished first. It will output:  
```
Winner (error): FastError
```  
Had the first promise settled first, it would log through the `.then` path instead.

<br/>

# 16. Implement Promise.finally (Medium)  
`Promise.prototype.finally` allows you to specify a callback that will be executed when the promise is settled (either fulfilled or rejected), *without* altering the promise’s resolved value or rejection reason. It’s typically used for cleanup (e.g., hide a loading spinner regardless of outcome).

**Solution:** We can polyfill `finally` using `.then`. The `finally` callback should be called and then the original value or error passed through. Specifically:  
- If the promise is fulfilled, call the callback, then resolve with the original value.  
- If the promise is rejected, call the callback, then reject with the original error.

We can attach these in a `Promise.prototype.myFinally` implementation:

```js
Promise.prototype.myFinally = function(callback) {
  return this.then(
    // onFulfilled: pass through value after callback
    value => {
      callback();
      return value;
    },
    // onRejected: execute callback and propagate the rejection
    err => {
      callback();
      throw err;
    }
  );
};
```

**Example Usage:**  
```js
new Promise((resolve, reject) => {
  // Simulate an async operation:
  setTimeout(() => resolve("Done"), 100);
})
  .then(result => {
    console.log("Result:", result);
  })
  .catch(error => {
    console.error("Error:", error);
  })
  .myFinally(() => {
    console.log("Cleanup - This runs regardless of success or failure.");
  });
```  
Output after 100ms:  
```
Result: Done  
Cleanup - This runs regardless of success or failure.
```  
The `finally` (here `myFinally`) callback runs after the promise is settled, and it doesn’t interfere with the result or error. If the promise had been rejected, it would still run the same cleanup message.

<br/>

# 17. Implement Custom JavaScript Promises (Super Hard)  
Implementing a custom Promise from scratch involves handling asynchronous resolution, maintaining state, and supporting chaining via `.then`. We need to manage: **internal state** (`pending`, `fulfilled`, `rejected`), **stored fulfillment/rejection handlers** (since the promise may not be settled when `.then` is called), and ensure that resolution of one promise triggers chained promises correctly (including handling if a handler returns another promise).

**Solution:** We create a `MyPromise` class. In its constructor, we execute an *executor function* immediately, which receives `resolve` and `reject` functions. The `resolve` and `reject` functions will transition the promise’s state and process any stored handlers. The `.then` method returns a new promise and registers what to do when the current promise settles.

Key points: 
- Ensure that handlers are called asynchronously (even if the promise is already resolved, mimic microtask timing using `setTimeout` or similar).
- If `.then` is called on a pending promise, store the handlers; if called on a already fulfilled/rejected promise, call the handler right away (but still asynchronously).
- Implement chainability: `.then` returns a new `MyPromise` that resolves or rejects based on the return value of the handler.

Below is a simplified implementation:

```js
class MyPromise {
  constructor(executor) {
    this.status = "pending";
    this.value = undefined;
    this.fulfillHandlers = [];
    this.rejectHandlers = [];

    const resolve = (val) => {
      if (this.status !== "pending") return;
      this.status = "fulfilled";
      this.value = val;
      // Execute fulfillment handlers asynchronously
      setTimeout(() => {
        this.fulfillHandlers.forEach(handler => handler(val));
      }, 0);
    };

    const reject = (err) => {
      if (this.status !== "pending") return;
      this.status = "rejected";
      this.value = err;
      setTimeout(() => {
        this.rejectHandlers.forEach(handler => handler(err));
      }, 0);
    };

    try {
      executor(resolve, reject);
    } catch (e) {
      reject(e);
    }
  }

  then(onFulfilled, onRejected) {
    return new MyPromise((nextResolve, nextReject) => {
      // Wrap handlers to handle chaining
      const handleFulfill = (val) => {
        if (typeof onFulfilled === "function") {
          try {
            const result = onFulfilled(val);
            // If result is a promise, chain it
            if (result instanceof MyPromise) {
              result.then(nextResolve, nextReject);
            } else {
              nextResolve(result);
            }
          } catch (error) {
            nextReject(error);
          }
        } else {
          // If no onFulfilled provided, just pass value through
          nextResolve(val);
        }
      };

      const handleReject = (err) => {
        if (typeof onRejected === "function") {
          try {
            const result = onRejected(err);
            if (result instanceof MyPromise) {
              result.then(nextResolve, nextReject);
            } else {
              // If onRejected handles the error, treat its return as a resolved value
              nextResolve(result);
            }
          } catch (error) {
            nextReject(error);
          }
        } else {
          // If no onRejected provided, propagate the error
          nextReject(err);
        }
      };

      if (this.status === "pending") {
        // Store handlers to execute later
        this.fulfillHandlers.push(handleFulfill);
        this.rejectHandlers.push(handleReject);
      } else if (this.status === "fulfilled") {
        setTimeout(() => handleFulfill(this.value), 0);
      } else if (this.status === "rejected") {
        setTimeout(() => handleReject(this.value), 0);
      }
    });
  }

  catch(onRejected) {
    return this.then(undefined, onRejected);
  }

  finally(onFinally) {
    return this.then(
      value => { 
        onFinally && onFinally();
        return value;
      },
      err => {
        onFinally && onFinally();
        throw err;
      }
    );
  }
}
```

**Example Usage:**  
```js
// Creating a promise that resolves after 1 second
const p = new MyPromise((resolve, reject) => {
  setTimeout(() => resolve("Hello, world!"), 1000);
});

// Chaining handlers
p.then(result => {
  console.log(result);             // Logs "Hello, world!" after 1s
  return "Chained value";
})
 .then(val => {
   console.log(val);               // Logs "Chained value"
   throw new Error("Oops!");
 })
 .catch(err => {
   console.error("Caught:", err.message);  // Logs "Caught: Oops!"
 })
 .finally(() => {
   console.log("Operation completed");     // Always runs at the end
 });
```  
This custom `MyPromise` supports basic functionalities: asynchronous resolution, chaining via `then`, error propagation with `catch`, and a `finally` for cleanup. The implementation handles converting returned values or thrown errors into the appropriate resolve/reject calls on the next promise in the chain. Note that a full Promise/A+ implementation is quite complex; this is a simplified model for educational purposes.

<br/>

# 18. Throttling Promises by Batching (Medium)  
**Throttling promises by batching** means limiting the number of promises that run concurrently by executing them in groups (batches). For example, if you have 100 API calls to make but want only 5 at a time, you would batch them into groups of 5.

**Solution:** Implement a function that accepts an array of promise-returning tasks and a batch size. Execute the first batch (up to `batchSize` promises), wait for all to settle, then continue with the next batch, and so on. We can achieve this by slicing the array of tasks and using `Promise.all` on each batch sequentially.

```js
function throttlePromises(tasks, batchSize) {
  const results = [];
  let index = 0;
  return new Promise((resolve, reject) => {
    function runBatch() {
      if (index >= tasks.length) {
        // All tasks processed
        return resolve(results);
      }
      // Take the next batch of tasks
      const batch = tasks.slice(index, index + batchSize);
      index += batchSize;
      // Execute all tasks in the current batch
      Promise.allSettled(batch.map(task => task()))
        .then(batchResults => {
          // Store each result or error indication
          batchResults.forEach((res, i) => {
            if (res.status === "fulfilled") {
              results.push(res.value);
            } else {
              results.push(new Error(res.reason));
            }
          });
          // Process next batch
          runBatch();
        })
        .catch(err => reject(err));
    }
    runBatch();
  });
}
```

*(In this implementation, we use `Promise.allSettled` so that one batch waits for all promises (resolved or rejected); we push either the resolved value or an `Error` for a rejection. Alternatively, you could reject immediately on the first error by using `Promise.all` and a catch.)*

**Example Usage:**  
```js
// Example tasks (some resolve, some reject after varying times)
const tasks = [
  () => fetch('/api/data1'), 
  () => fetch('/api/data2'),
  () => fetch('/api/data3'),
  // ... more tasks
];

throttlePromises(tasks, 2)
  .then(results => {
    console.log("All tasks done:");
    results.forEach((res, i) => console.log(`Task ${i+1}:`, res));
  });
```  
If `tasks` includes multiple fetch calls, this will execute only 2 at a time. Once the first two finish, it proceeds with the next two, and so on. This prevents flooding the system with too many concurrent operations. The `results` array will contain each task’s outcome in order. (If a task failed, that entry would be an `Error` object in this implementation.)

<br/>

# 19. Implement Custom Deep Equal (Hard)  
A **deep equality** check determines if two values are structurally the same, considering nested objects, arrays, and primitives. Unlike simple `===` (which checks reference for objects/arrays), deep equal will recursively compare the contents.

**Solution:** We can implement a `deepEqual(a, b)` function that handles various data types:
- If `a` and `b` are strictly equal (`===`), return true (covers primitives that are not objects, except that NaN !== NaN needs a special case).
- If one of them is `null` (and the other isn’t), return false.
- If their types differ, return false.
- If they are Date objects, compare their time values (getTime).
- If they are arrays, compare lengths and then recursively compare each element.
- If they are plain objects, compare keys length and values for each key recursively.
- Optionally, handle special objects like RegExp (compare pattern and flags).
- To avoid infinite recursion on circular references, you could keep track of visited objects (not implemented in this basic solution).

```js
function deepEqual(a, b) {
  // Check exact equality first (this covers primitives and reference equality)
  if (a === b) {
    // Special case: NaN !== NaN in JS, but deepEqual should consider them equal
    return a !== undefined || b !== undefined ? true : true; 
    // (The above line can be simplified; essentially, if a === b and not undefined, it's true. 
    // For NaN, a===b is false, so we'll handle NaN later in else.)
  }
  // If both are NaN (they are not ===), consider equal
  if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)) {
    return true;
  }
  // If either is null or types differ or not objects, they are not equal (we already handled primitives that were === above)
  if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  // If both are Date objects, compare their time values
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // If both are RegExp, compare source and flags
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }

  // Compare arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Compare plain objects
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  // Check that every key in a is present in b and values are deeply equal
  for (let key of keysA) {
    if (!b.hasOwnProperty(key) || !deepEqual(a[key], b[key])) {
      return false;
    }
  }
  return true;
}
```

**Example Usage:**  
```js
console.log(deepEqual(42, 42)); // true (primitive equality)
console.log(deepEqual({x:1, y:[2,3]}, {x:1, y:[2,3]})); // true (structures match)
console.log(deepEqual({x:1, y:2}, {x:1})); // false (different keys)
console.log(deepEqual(NaN, NaN)); // true (deepEqual treats NaNs as equal)
console.log(deepEqual([1, {a:5}], [1, {a:6}])); // false (nested value differs)
```  
This function will correctly handle most JSON-like structures. For instance, two different objects with the same properties and deep values will be considered equal. Note that this implementation does not handle circular references; in a production scenario, you would add a mechanism (like a WeakMap) to detect cycles.

<br/>

# 20. Implement Custom Object.assign (Medium)  
`Object.assign(target, ...sources)` copies enumerable own properties from source objects to the target object and returns the target. We can implement a similar functionality.

**Solution:** Check that the target is not `null` or `undefined` (because `Object.assign` throws an error in that case). Then for each source, iterate over its own keys (and optionally symbols) and copy the values to the target. We will also return the modified target.

```js
function customAssign(target, ...sources) {
  if (target == null) {
    throw new TypeError("Cannot convert undefined or null to object");
  }
  // Ensure target is an object (in case a primitive is passed)
  let to = Object(target);

  for (const source of sources) {
    if (source != null) {  // skip if source is null/undefined
      // Copy all own enumerable string keys
      for (const key of Object.keys(source)) {
        to[key] = source[key];
      }
      // Copy all own enumerable symbol keys as well (to fully emulate Object.assign)
      for (const sym of Object.getOwnPropertySymbols(source)) {
        if (source.propertyIsEnumerable(sym)) {
          to[sym] = source[sym];
        }
      }
    }
  }
  return to;
}
```

**Example Usage:**  
```js
const target = { a: 1 };
const source1 = { b: 2, c: 3 };
const source2 = { a: 10, d: 4 };

const result = customAssign(target, source1, source2);
console.log(result);       // { a: 10, b: 2, c: 3, d: 4 }
console.log(target === result);  // true (assign modifies target and returns it)
```  
In this example, `target` ended up with properties merged from `source1` and `source2`. Notice `a` was overwritten by `source2`’s value (10). The behavior matches `Object.assign`: it shallow-copies properties and later sources overwrite earlier ones for the same key. Non-enumerable properties or inherited properties are not copied, similar to the native behavior.

<br/>

# 21. Implement Custom JSON.stringify (Hard)  
`JSON.stringify` converts a JavaScript value into a JSON string. Implementing it involves handling different data types according to JSON rules:
- Primitives (number, boolean, null): convert to literal strings (`"123"`, `"true"`, `"null"`).
- Strings: need to be quoted and special characters escaped.
- Arrays: stringify each element (or `null` if undefined) and join with commas, wrapped in `[...]`.
- Objects: iterate own properties, stringify each value (skip undefined/functions), and format as `{"key": value, ...}`.
- Functions and `undefined`: if encountered in object values, they are omitted; if in arrays, they become `null`.
- Special objects like Date (should be converted to ISO string) or RegExp (not JSON data types, usually omitted or treated as empty objects by JSON.stringify).

A full implementation is complex, but we can demonstrate a simplified version covering typical cases.

**Solution:** Implement a recursive function that checks the type of the input and builds the JSON string accordingly.

```js
function customStringify(value) {
  // Handle null (typeof null is "object", so handle upfront)
  if (value === null) {
    return "null";
  }
  const type = typeof value;

  // Primitives
  if (type === "number" || type === "boolean") {
    return isFinite(value) ? String(value) : "null"; 
    // JSON.stringify converts Infinity/NaN to "null"
  }
  if (type === "string") {
    // Escape special characters in the string
    return `"${value.replace(/\\/g, '\\\\')
                    .replace(/"/g, '\\"')
                    .replace(/\n/g, '\\n')
                    .replace(/\r/g, '\\r')
                    .replace(/\t/g, '\\t')}"`;
  }

  // Functions or undefined are not represented in JSON (when in an object)
  if (type === "undefined" || type === "function") {
    return undefined;
  }

  // Arrays
  if (Array.isArray(value)) {
    // Map each element through customStringify (undefined -> null in array)
    const elems = value.map(elem => {
      const str = customStringify(elem);
      return str === undefined ? "null" : str;
    });
    return `[${elems.join(",")}]`;
  }

  // Objects (including non-array, non-null objects)
  if (type === "object") {
    // If it's a Date, convert to ISO string in quotes
    if (value instanceof Date) {
      return `"${value.toISOString()}"`;
    }

    // For regular objects, iterate own properties
    const keys = Object.keys(value);
    const keyValuePairs = [];
    for (const key of keys) {
      const valStr = customStringify(value[key]);
      if (valStr !== undefined) {  // skip keys with undefined or function values
        keyValuePairs.push(`"${key}":${valStr}`);
      }
    }
    return `{${keyValuePairs.join(",")}}`;
  }

  // For any other case (such as Symbol), return undefined (JSON.stringify skips it)
  return undefined;
}
```

**Example Usage:**  
```js
console.log(customStringify({ x: 10, y: "Hello\nWorld", z: true }));  
// Output: {"x":10,"y":"Hello\nWorld","z":true}

console.log(customStringify([1, undefined, 3]));          
// Output: [1,null,3]  (undefined becomes null in arrays)

console.log(customStringify({ a: 1, b: undefined, c: () => {} }));  
// Output: {"a":1}  (undefined and functions omitted in objects)

console.log(customStringify({ date: new Date("2020-01-01T00:00:00Z") }));  
// Output: {"date":"2020-01-01T00:00:00.000Z"}  (Date object to ISO string)
```  
This `customStringify` function covers many common behaviors of `JSON.stringify`. It recursively builds the JSON text. Note that for brevity it does not handle every edge case exactly as the spec (for example, it doesn’t handle circular references (which JSON.stringify would throw on) or custom toJSON methods on objects). But it illustrates the core idea of serializing different data types according to JSON rules.

<br/>

# 22. Implement Custom JSON.parse (Super Hard)  
`JSON.parse` takes a JSON string and parses it into a JavaScript value. Writing a full JSON parser from scratch is challenging, as it involves lexical analysis and grammar parsing. We’ll outline a simplified approach that can handle basic JSON structures (objects, arrays, strings, numbers, booleans, and null). A robust solution typically tokenizes the input and then recursively builds the data structure.

**Solution:** Implement a recursive descent parser:
1. Remove whitespace that is not inside strings.
2. Identify the next token by inspecting the first character:
   - `{` begins an object, `[` begins an array.
   - `"` begins a string.
   - digits or `-` begin a number.
   - `t`, `f`, `n` begin the literals `true`, `false`, `null`.
3. Parse accordingly:
   - **Object**: expect keys as strings, then `:`, then values, separated by commas, and a closing `}`.
   - **Array**: expect values separated by commas, and a closing `]`.
   - **String**: read characters until the closing `"`, handling escape sequences.
   - **Number**: read a sequence matching JSON’s number pattern.
   - **Literals**: match `true`, `false`, or `null`.

For brevity, here’s a simplified implementation focusing on structure (not fully covering all JSON specifications):

```js
function customParse(json) {
  let index = 0;

  function skipWhitespace() {
    while (/\s/.test(json[index])) {
      index++;
    }
  }

  function parseValue() {
    skipWhitespace();
    if (json[index] === '"') {
      return parseString();
    } else if (json[index] === '{') {
      return parseObject();
    } else if (json[index] === '[') {
      return parseArray();
    } else if (/[-0-9]/.test(json[index])) {
      return parseNumber();
    } else if (json.startsWith("true", index)) {
      index += 4;
      return true;
    } else if (json.startsWith("false", index)) {
      index += 5;
      return false;
    } else if (json.startsWith("null", index)) {
      index += 4;
      return null;
    }
    throw new SyntaxError(`Unexpected token ${json[index]} at position ${index}`);
  }

  function parseString() {
    let result = '';
    index++; // skip opening quote
    while (index < json.length) {
      const char = json[index++];
      if (char === '"') {
        // closing quote
        return result;
      }
      if (char === '\\') {
        // escape sequence
        const nextChar = json[index++];
        switch (nextChar) {
          case '"': result += '"'; break;
          case '\\': result += '\\'; break;
          case 'n': result += '\n'; break;
          case 'r': result += '\r'; break;
          case 't': result += '\t'; break;
          case 'b': result += '\b'; break;
          case 'f': result += '\f'; break;
          default: result += nextChar;
        }
      } else {
        result += char;
      }
    }
    throw new SyntaxError("Unterminated string");
  }

  function parseNumber() {
    const numRegex = /-?\d+(\.\d+)?([eE][+-]?\d+)?/y;
    numRegex.lastIndex = index;
    const match = numRegex.exec(json);
    if (!match) {
      throw new SyntaxError(`Invalid number at position ${index}`);
    }
    index += match[0].length;
    return Number(match[0]);
  }

  function parseArray() {
    const arr = [];
    index++; // skip '['
    skipWhitespace();
    if (json[index] === ']') {
      index++;
      return arr; // empty array
    }
    while (true) {
      const value = parseValue();
      arr.push(value);
      skipWhitespace();
      if (json[index] === ']') {
        index++;
        break;
      }
      if (json[index] === ',') {
        index++;
        continue;
      }
      throw new SyntaxError(`Expected ',' or ']' at position ${index}`);
    }
    return arr;
  }

  function parseObject() {
    const obj = {};
    index++; // skip '{'
    skipWhitespace();
    if (json[index] === '}') {
      index++;
      return obj; // empty object
    }
    while (true) {
      // keys must be strings
      if (json[index] !== '"') {
        throw new SyntaxError(`Expected '\"' at position ${index} for object key`);
      }
      const key = parseString();
      skipWhitespace();
      if (json[index] !== ':') {
        throw new SyntaxError(`Expected ':' after key at position ${index}`);
      }
      index++; // skip ':'
      const value = parseValue();
      obj[key] = value;
      skipWhitespace();
      if (json[index] === '}') {
        index++;
        break;
      }
      if (json[index] === ',') {
        index++;
        skipWhitespace();
        continue;
      }
      throw new SyntaxError(`Expected ',' or '}' at position ${index}`);
    }
    return obj;
  }

  const result = parseValue();
  skipWhitespace();
  if (index < json.length) {
    throw new SyntaxError(`Unexpected extra input at position ${index}`);
  }
  return result;
}
```

**Example Usage:**  
```js
console.log(customParse('{"a":1,"b":[true,false,null],"c":"Hello"}'));
// Output: { a: 1, b: [ true, false, null ], c: "Hello" }

console.log(customParse('42'));           // Output: 42 (number)
console.log(customParse('"Hello\\nWorld"')); // Output: "Hello
                                            //          World" (with newline)
```  
This `customParse` can handle basic JSON strings. For example, `'{"a":1,"b":[true,false,null]}'` will produce an object `{ a: 1, b: [true, false, null] }`. The parser goes character by character, building structures accordingly. It supports string escape sequences like `\n` and simple number formats. In a real scenario, you’d want to add more thorough error handling and support all JSON specification details, but this demonstrates the general approach.

<br/>

# 23. Implement Custom typeof operator (Medium)  
JavaScript’s built-in `typeof` has some quirks (for example, `typeof null === "object"` and all objects (arrays, dates) just return `"object"`). We can create a more robust type-checking function that returns specific types for arrays, null, etc., or at least mimic the behavior of `typeof` accurately.

**Solution:** We can use `Object.prototype.toString.call(value)` which returns a string like `"[object Type]"` to determine the internal `[[Class]]`. This is a common trick to get precise type information:
- `Object.prototype.toString.call(null)` returns `"[object Null]"`.
- For an array, `"[object Array]"`.
- For a Date, `"[object Date]"`, etc.

Using this, we can map to a lowercase type string. For primitives, we fallback to `typeof`.

```js
function typeOf(value) {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  const type = typeof value;
  // For non-objects (except null which we handled), typeof is sufficient
  if (type !== "object") {
    return type;  // "string", "number", "boolean", "function", "symbol", "bigint"
  }
  // For objects: differentiate between array, date, etc.
  const tag = Object.prototype.toString.call(value);  // e.g. "[object Array]"
  const objectType = tag.slice(8, -1);                // e.g. "Array"
  return objectType.toLowerCase();
}
```

This custom `typeOf` returns `'array'` for arrays, `'date'` for Date objects, `'regexp'` for regular expressions, `'object'` for plain objects, `'null'` for null, etc., instead of some of the ambiguous results from `typeof`.

**Example Usage:**  
```js
console.log(typeOf(100));              // "number"
console.log(typeOf(null));             // "null"  (built-in typeof would give "object")
console.log(typeOf([1,2,3]));          // "array" (built-in would give "object")
console.log(typeOf({foo: "bar"}));     // "object"
console.log(typeOf(new Date()));       // "date"
console.log(typeOf(/regex/));          // "regexp"
console.log(typeOf(() => {}));         // "function"
```  
This provides a clearer type identification. It can be useful for debugging or when you need to handle specific object types differently. The implementation uses built-in logic by inspecting the internal class name via `toString` on the object.

<br/>

# 24. Implement Custom lodash _.get() (Medium)  
Lodash’s `_.get(object, path, [defaultValue])` safely retrieves a nested property value from an object, given a path (as a string or array), returning a default if the path is not found. We can implement this to avoid errors when accessing deep properties that may not exist.

**Solution:** Accept the object, a path (string or array). If path is a string like `"a.b.c"` or `"a[0].b"`, convert it into an array of keys by splitting on `.` and handling bracket notation. Then iterate through the keys on the object, diving deeper at each step. If at any point the next key doesn’t exist (object becomes `undefined` or `null`), return the default value. If we successfully get to the end of the path, return that value (or the default if the final value is `undefined` and a default is provided, depending on desired behavior).

```js
function get(obj, path, defaultValue) {
  if (obj == null) return defaultValue;
  // Convert path to array if it's a string
  let pathArray;
  if (typeof path === "string") {
    // Support dot notation and bracket notation
    pathArray = path.replace(/\[(\w+)\]/g, '.$1').split('.'); 
    // Example: "a[0].b" -> ["a","0","b"]
  } else {
    pathArray = path;
  }

  let current = obj;
  for (let key of pathArray) {
    if (current == null) {
      // can't go further
      return defaultValue;
    }
    // If key is a number string (from array index), convert to number
    if (Number.isFinite(Number(key)) && Array.isArray(current)) {
      key = Number(key);
    }
    if (!(key in current)) {
      return defaultValue;
    }
    current = current[key];
  }
  // If we ended up with undefined (actual undefined value), return default if provided
  if (current === undefined && defaultValue !== undefined) {
    return defaultValue;
  }
  return current;
}
```

**Example Usage:**  
```js
const data = { user: { name: "Alice", posts: [ { title: "Hello" } ] } };

console.log(get(data, "user.name"));              // "Alice"
console.log(get(data, "user.posts[0].title"));    // "Hello"
console.log(get(data, ["user", "posts", 1, "title"], "No Title")); // "No Title"
// Explanation: data.user.posts[1] is undefined, so returns default "No Title"
```  
In the example:
- `get(data, "user.name")` returns `"Alice"` (safe access into `user` object).
- `get(data, "user.posts[0].title")` returns `"Hello"` (handles array index in path).
- The last call tries to get `user.posts[1].title`. Since `posts[1]` doesn’t exist, it returns the provided default `"No Title"` instead of throwing an error. 

This is very useful for safely accessing deep nested values without repetitive existence checks.

<br/>

# 25. Implement Custom lodash _.set() (Medium)  
Lodash’s `_.set(object, path, value)` sets a value on a nested path inside an object, creating intermediate objects/arrays if needed. Essentially, it’s the inverse of `_.get`.

**Solution:** Accept the object, a path (string or array notation), and a value. Traverse the object following the path. If at some point the next key doesn’t exist or is not an object, create an object or array depending on whether the next key looks like a number (for array index) or not. Finally, assign the value to the last key.

```js
function set(obj, path, value) {
  if (typeof path === "string") {
    path = path.replace(/\[(\w+)\]/g, '.$1').split('.');
  }
  if (path.length === 0) return obj;
  
  let current = obj;
  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    const isLast = i === path.length - 1;
    if (isLast) {
      // Set value at the last key
      current[key] = value;
    } else {
      // If the next key is a number and current[key] isn't an array, make it an array
      const nextKey = path[i+1];
      const shouldBeArray = /^\d+$/.test(nextKey);  // next key looks like an index
      if (current[key] == null || typeof current[key] !== 'object') {
        // Create an empty array or object based on next key type
        current[key] = shouldBeArray ? [] : {};
      }
      current = current[key];
    }
  }
  return obj;
}
```

**Example Usage:**  
```js
const obj = { };
set(obj, "user.profile.name", "Bob");
console.log(obj);
// obj is now { user: { profile: { name: "Bob" } } }

set(obj, "user.tags[0]", "admin");
set(obj, "user.tags[1]", "editor");
console.log(obj.user.tags);
// ["admin", "editor"]

set(obj, ["settings", "items", 2, "enabled"], true);
console.log(JSON.stringify(obj));
/* 
{
  "user": { "profile": { "name": "Bob" }, "tags": ["admin", "editor"] },
  "settings": { "items": [ null, null, { "enabled": true } ] }
}
*/
```  
In the examples:
- We set `user.profile.name` to `"Bob"`, creating the nested objects as needed.
- We set `user.tags[0]` and `[1]`, which creates an array `tags` and assigns indices 0 and 1.
- We set a deeply nested array/object path `settings.items[2].enabled`. Intermediate objects/arrays are created: `settings` as an object, `items` as an array (with indexes 0 and 1 as `null` since we skipped them) and index 2 as an object with `enabled: true`. 

After these operations, `obj` has the full structure with given values.

<br/>

# 26. Implement Custom lodash _.omit() (Medium)  
Lodash’s `_.omit(object, [paths])` returns a **shallow copy of the object without the specified keys**. Essentially, it removes certain properties from an object. We can implement this easily by iterating over the object’s own properties.

**Solution:** Create a new result object. For each key in the original object, if the key is *not* in the list of keys to omit, copy it to the result. Any keys that match the omit list are skipped.

```js
function omit(obj, keysToOmit) {
  if (!obj || typeof obj !== 'object') return {};
  const omitSet = new Set(Array.isArray(keysToOmit) ? keysToOmit : [keysToOmit]);
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!omitSet.has(key)) {
      result[key] = value;
    }
  }
  return result;
}
```

**Example Usage:**  
```js
const original = { name: "Alice", age: 25, password: "secret", city: "NYC" };
const filtered = omit(original, ["password", "age"]);
console.log(filtered);       // { name: "Alice", city: "NYC" }
console.log(original);       // { name: "Alice", age: 25, password: "secret", city: "NYC" }
```  
In this example, `filtered` is a new object that omits the `password` and `age` properties from `original`. The `original` object remains unchanged (we performed a shallow copy of allowed properties). If only a single key is to be omitted, you can pass it as a string instead of an array (our implementation normalizes it into an array or set internally).

This function does not recurse into nested objects; it only removes top-level keys as specified (which is what lodash’s omit does by default).

<br/>

# 27. Implement Custom String Tokenizer (Medium)  
A **string tokenizer** parses a string into tokens based on certain delimiters, while possibly handling quotes or escape characters so that delimiters inside quotes are ignored. This is akin to how a command-line or CSV parser might work.

**Solution:** We can create a function `customTokenizer(str, delimiters, quoteChar)` that splits on given delimiters (e.g., space, comma) but keeps text within quote characters together as a single token. We also handle escape sequences (like `\"` to include a quote in a quoted string).

Plan:
- Iterate through the string character by character.
- Maintain a `currentToken` buffer and flags: `inQuotes` (if we are currently inside a quoted segment) and `escapeNext` (if the current char is escaped).
- If we hit a delimiter *and we’re not inside quotes*, that signifies the end of a token.
- If we hit the quote character and we’re not in an escape sequence, toggle the `inQuotes` state (entering or leaving a quoted section), and include the quote in the token or choose to exclude it based on desired output. (Here we’ll exclude it from the final token content.)
- If we see a backslash `\` and we’re not currently escaping, set `escapeNext` flag to true (so the next char is taken literally).
- Otherwise, add the character to `currentToken`.
- After looping, push the last token (if any) to the result list.

```js
function customTokenizer(str, delimiters = [' ', ','], quoteChar = '"') {
  const tokens = [];
  let currentToken = '';
  let inQuotes = false;
  let escapeNext = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (escapeNext) {
      // Take the character literally
      currentToken += char;
      escapeNext = false;
    } else if (char === '\\') {
      // Next character is escaped
      escapeNext = true;
    } else if (char === quoteChar) {
      // Toggle quote status
      inQuotes = !inQuotes;
      continue;  // (We don't include the quote character itself in the token output)
    } else if (!inQuotes && delimiters.includes(char)) {
      // If not in quotes and current char is a delimiter, finalize the current token
      if (currentToken !== '') {
        tokens.push(currentToken);
        currentToken = '';
      }
      // If token is empty and delimiter encountered, it can indicate multiple delimiters in a row,
      // which we treat as potentially an empty token or just skip. Here we choose to skip adding empty token.
    } else {
      // Regular character (either not a delimiter or inside quotes), add to token
      currentToken += char;
    }
  }
  // Push the last token if any
  if (currentToken !== '') {
    tokens.push(currentToken);
  }
  return tokens;
}
```

**Example Usage:**  
```js
const text = `value1, "value 2, still in quotes", value3\\,escaped, final`;
const tokens = customTokenizer(text, [',', ' '], '"');
console.log(tokens);
/* Expected tokens:
[
  "value1",
  "value 2, still in quotes",
  "value3,escaped",
  "final"
]
*/
```  
Explanation of the example:  
- The input string contains commas and spaces as delimiters. 
- `"value 2, still in quotes"` is enclosed in quotes, so the comma inside it is not treated as a delimiter, and the spaces inside are preserved as part of the token. Thus it becomes one token: `value 2, still in quotes` (without the surrounding quotes). 
- `value3\\,escaped` contains an escaped comma (`\\,` becomes `\,` in the actual string after escaping), so that comma is treated as a normal character, resulting in token `value3,escaped`. 
- Other commas separate tokens normally (like after `value1` and after the quoted part). 

Our tokenizer handles quoted substrings and escape sequences so that delimiters and quote characters can be part of tokens when appropriately escaped or enclosed. This resembles how a CSV parser or shell argument parser works.

<br/>

# 28. Implement Custom setTimeout (Medium)  
Implementing `setTimeout` from scratch in JavaScript isn’t fully possible without native capabilities, but we can simulate the behavior. Essentially, `setTimeout(fn, delay)` sets up an asynchronous callback. To emulate it, one can use other timing APIs like `setInterval` or `requestAnimationFrame`, or even a busy wait (not ideal). We can also illustrate the concept by managing our own timer queue.

**Solution:** Use `Date.now()` to track elapsed time and repeatedly check until the delay is reached, then call the callback. We’ll use `requestAnimationFrame` (browser) or a recursive `setImmediate`/`setTimeout(0)` (in Node) to avoid blocking. We also need to return an ID and allow cancellation via `clearTimeout`.

One approach:
- Create a unique ID for each scheduled callback.
- Maintain a map of scheduled tasks.
- Use `requestAnimationFrame` (which runs roughly ~60 times a second) to check if the time has elapsed.
- When time is up, execute the callback (if not cleared) and clean up.

```js
let timeoutIdCounter = 0;
const timeoutTasks = new Map();

function mySetTimeout(callback, delay, ...args) {
  const id = ++timeoutIdCounter;
  const start = Date.now();
  function check() {
    if (!timeoutTasks.has(id)) {
      // If task was cleared, do nothing
      return;
    }
    const elapsed = Date.now() - start;
    if (elapsed >= delay) {
      timeoutTasks.delete(id);
      callback(...args);
    } else {
      // Not yet reached delay, continue checking
      requestAnimationFrame(check);
    }
  }
  timeoutTasks.set(id, true);
  requestAnimationFrame(check);
  return id;
}

function myClearTimeout(id) {
  timeoutTasks.delete(id);
}
```

**Example Usage:**  
```js
const id = mySetTimeout(() => console.log("Timed out!"), 1000);
 // If we wanted to cancel it:
 // myClearTimeout(id);

console.log("Waiting...");
```  
This will log “Waiting...” immediately, and then approximately one second later log “Timed out!”. If `myClearTimeout(id)` is called before the timeout, the message would never log.

**How it works:** We continuously check the time using `requestAnimationFrame` (which schedules the next check on the next repaint tick). When the specified delay has passed, we invoke the callback. This mimics the behavior of `setTimeout` without using it internally. Note that `requestAnimationFrame` is used here for demonstration; for more accurate or environment-neutral timing, you might use `setInterval` or a combination of `Date.now()` in a tighter loop (though busy-waiting is CPU intensive). 

Also, this implementation is not as precise as the native `setTimeout` and is limited by the frame rate (in a browser). But it showcases the concept of scheduling and cancellation with IDs.

<br/>

# 29. Implement Custom setInterval (Medium)  
`setInterval` repeatedly calls a function at specified intervals. We can simulate it using recursive `setTimeout` calls or similar techniques as in our custom `setTimeout`.

**Solution:** Use `mySetTimeout` (from above) repeatedly. Essentially, when the callback fires, schedule it again. We’ll provide `mySetInterval(fn, delay, ...args)` that returns an interval ID, and a `myClearInterval(id)` to stop it.

One way:
- Use the same ID map as before, or separate one for intervals.
- When scheduling an interval, create a function that calls the callback, then if still scheduled, reschedules itself.

```js
let intervalIdCounter = 0;
const intervalTasks = new Map();

function mySetInterval(callback, delay, ...args) {
  const id = ++intervalIdCounter;
  intervalTasks.set(id, true);
  
  function tick() {
    if (!intervalTasks.has(id)) {
      return; // interval cleared
    }
    callback(...args);
    // Schedule next tick after delay
    mySetTimeout(tick, delay);
  }
  // Initial call after delay
  mySetTimeout(tick, delay);
  return id;
}

function myClearInterval(id) {
  intervalTasks.delete(id);
}
```

Here, `mySetInterval` uses `mySetTimeout` internally to schedule each repetition. We keep track of active interval IDs in a map to know if it’s been cleared.

**Example Usage:**  
```js
let count = 0;
const id = mySetInterval(() => {
  count++;
  console.log(`Tick ${count}`);
  if (count === 5) {
    console.log("Stopping interval.");
    myClearInterval(id);
  }
}, 500);
```  
This will log:
```
Tick 1
Tick 2
Tick 3
Tick 4
Tick 5
Stopping interval.
```  
approximately every 500ms. After 5 ticks, we clear the interval, so it stops.

**How it works:** We effectively chain `setTimeout` calls to achieve a recurring schedule. This approach is similar to how you could implement `setInterval` with standard APIs (often done to avoid drift or to have more control by adjusting schedule each time). Using `mySetTimeout` inside ensures that our custom timer mechanism is used for waiting.

Note: In this simple implementation, there’s a small nuance — we used `mySetTimeout` which in turn used `requestAnimationFrame`, so timing might not be exact if the environment’s frame rate is low or the tab is inactive (browsers throttle RAFTimers in inactive tabs). But conceptually, it shows how intervals can be built from timeouts.

<br/>

# 30. Implement Custom clearAllTimers (Easy)  
A function `clearAllTimers` would cancel all pending timeouts and intervals that were set (through our custom functions, or even native ones if we track those). The idea is to have a one-call cleanup for every scheduled timer.

**Solution:** If we are managing our own timers (as in the custom implementations above), we can keep a registry of all active timer IDs. Then `clearAllTimers` can iterate and cancel each one.

For our custom timers, we maintained `timeoutTasks` and `intervalTasks` maps. We can clear those entirely:

```js
function clearAllTimers() {
  // Clear all pending timeouts
  for (let id of timeoutTasks.keys()) {
    timeoutTasks.delete(id);
  }
  // Clear all intervals
  for (let id of intervalTasks.keys()) {
    intervalTasks.delete(id);
  }
  // If we also wanted to clear native timers (if we stored their IDs), we could iterate and clear them too.
}
```

If we want to be extensive and also clear any *native* `setTimeout`/`setInterval` calls that we may have recorded, we could store those IDs when created and clear them similarly with `clearTimeout`/`clearInterval`. For demonstration, the above clears custom-managed timers.

**Example Usage:**  
```js
mySetTimeout(() => console.log("Timeout A"), 1000);
mySetTimeout(() => console.log("Timeout B"), 2000);
mySetInterval(() => console.log("Interval X"), 500);

setTimeout(() => {
  console.log("Clearing all timers now...");
  clearAllTimers();
}, 1500);
```  
In this scenario:
- “Timeout A” is scheduled for 1s, “Timeout B” for 2s, an “Interval X” every 0.5s.
- After 1.5s, `clearAllTimers` is called. By that time, Timeout A likely executed (at ~1s), Interval X might have ticked 2-3 times.
- When `clearAllTimers` runs at 1.5s, it will prevent “Timeout B” from firing (2s) and stop further “Interval X” logs.
- You would see output for “Timeout A” and some “Interval X” ticks, then “Clearing all timers now...”, and no further timer outputs.

This function is handy for cleanup (for example, clearing all timers when navigating away from a page or resetting a test environment).

<br/>

# 31. Implement Custom Event Emitter (Medium)  
An **Event Emitter** (or Pub/Sub, or Observer pattern) allows parts of your code to subscribe to events and other parts to emit events, decoupling the event source from the listeners. We can implement an `EventEmitter` class with methods:
- `on(eventName, listener)`: to subscribe to an event.
- `emit(eventName, ...args)`: to publish/trigger the event with optional arguments.
- `off(eventName, listener)`: to unsubscribe a specific listener (or all listeners) for an event.
- (Optional) `once(eventName, listener)`: to subscribe only for one emission.

**Solution:** Use an internal dictionary (object or `Map`) where keys are event names and values are arrays of listener functions. Implement the methods as described:
- `on`: add the listener to the array for that event.
- `emit`: call all listeners in the array with the provided arguments.
- `off`: filter out the given listener from the array (or clear the array if no specific listener is provided or for removing all).
- `once`: can be implemented by wrapping a normal `on` with a handler that deregisters itself.

```js
class EventEmitter {
  constructor() {
    this.events = {};  // { eventName: [listener1, listener2, ...] }
  }

  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }

  off(event, listener) {
    if (!this.events[event]) return;
    if (!listener) {
      // if no specific listener provided, remove all listeners for this event
      delete this.events[event];
    } else {
      this.events[event] = this.events[event].filter(l => l !== listener);
    }
  }

  emit(event, ...args) {
    if (!this.events[event]) return;
    for (const listener of this.events[event]) {
      try {
        listener.apply(this, args);
      } catch (err) {
        console.error(`Error in '${event}' listener:`, err);
      }
    }
  }

  once(event, listener) {
    const wrapper = (...args) => {
      this.off(event, wrapper);  // remove after first call
      listener.apply(this, args);
    };
    this.on(event, wrapper);
  }
}
```

**Example Usage:**  
```js
const emitter = new EventEmitter();

function onData(data) {
  console.log("Data received:", data);
}
emitter.on("data", onData);

emitter.once("data", (data) => {
  console.log("This will only log once:", data);
});

emitter.emit("data", { value: 42 });
// Console:
// Data received: { value: 42 }
// This will only log once: { value: 42 }

emitter.emit("data", { value: 100 });
// Console:
// Data received: { value: 100 }
// (the one-time listener has been removed, so it doesn’t log again)

emitter.off("data", onData);
emitter.emit("data", { value: 7 });  // no output (all listeners removed)
```  
In this example:
- We added two listeners to the `"data"` event: a normal one (`onData`) and a one-time listener.
- On the first `emit("data", {...})`, both listeners fire. The one-time listener then unregisters itself.
- On the second `emit`, only the persistent listener runs.
- We then remove the persistent listener with `off`, so emitting again produces no output.

This custom `EventEmitter` mimics the pattern used in Node.js and various frameworks, allowing decoupled communication. It can be extended with features like wildcards or event name patterns if needed.

<br/>

# 32. Implement Custom Browser History (Medium)  
A simple **browser history** implementation manages navigation through a stack of visited “pages” or states, supporting moving backward and forward. We can implement a class with methods like:
- `visit(page)`: go to a new page (pushes it on the history stack and clears forward history).
- `back()`: go back to the previous page (if exists).
- `forward()`: go forward to the next page (if exists).

**Solution:** Use two stacks (arrays):
- a **back stack** to keep pages to the left of the current page,
- a **forward stack** for pages to the right of the current page,
- and a `current` to hold the current page.

When a new page is visited via `visit`, push the current page onto the back stack, clear the forward stack, and set current to the new page.  
When `back` is called, push the current page onto the forward stack, pop the last page from the back stack to set as current (if available).  
When `forward` is called, push current onto back stack, pop from forward stack to current.  

```js
class BrowserHistory {
  constructor(initialPage) {
    this.backStack = [];
    this.forwardStack = [];
    this.current = initialPage;
  }

  visit(page) {
    if (this.current !== undefined) {
      this.backStack.push(this.current);
    }
    this.current = page;
    this.forwardStack = [];  // clear forward history
    return this.current;
  }

  back() {
    if (this.backStack.length === 0) return null;
    this.forwardStack.push(this.current);
    this.current = this.backStack.pop();
    return this.current;
  }

  forward() {
    if (this.forwardStack.length === 0) return null;
    this.backStack.push(this.current);
    this.current = this.forwardStack.pop();
    return this.current;
  }
}
```

**Example Usage:**  
```js
const history = new BrowserHistory("Page1");
history.visit("Page2");
history.visit("Page3");
console.log(history.current);       // "Page3"
console.log(history.back());        // "Page2"  (went back to Page2)
console.log(history.back());        // "Page1"  (went back to Page1)
console.log(history.forward());     // "Page2"  (forward to Page2 again)
history.visit("Page4");             
console.log(history.current);       // "Page4"
console.log(history.forward());     // null (no forward history because we navigated anew)
console.log(history.back());        // "Page2"
```  
Sequence explanation:
- Start at Page1.
- Visit Page2 (now backStack = [Page1], current = Page2).
- Visit Page3 (backStack = [Page1, Page2], current = Page3).
- Go back: moves to Page2 (current = Page2, forwardStack = [Page3]).
- Go back again: moves to Page1 (current = Page1, forwardStack = [Page3, Page2]).
- Go forward: moves to Page2 (current = Page2, backStack = [Page1], forwardStack = [Page3]).
- Visit Page4: clears forwardStack and sets current = Page4 (backStack = [Page1, Page2]).
- Forward now returns null because forwardStack is empty (we started a new branch by visiting Page4).
- Back from Page4 takes us to Page2.

This is analogous to how a web browser’s history might work with a back and forward button. Our implementation stores page identifiers (here just strings for simplicity, but they could be route objects or URLs).

<br/>

# 33. Implement Custom lodash _.chunk() (Medium)  
Lodash’s `_.chunk(array, size)` splits an array into an array of smaller arrays (`“chunks”`) of the specified size. The last chunk will contain the remaining elements if the array length isn’t perfectly divisible by the chunk size.

**Solution:** Iterate over the input array and slice it into pieces of length `size`. This can be done with a simple loop stepping by `size`, or using `Array.prototype.slice` inside the loop.

```js
function chunk(array, size = 1) {
  if (size <= 0) throw new Error("Chunk size must be a positive number");
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}
```

**Example Usage:**  
```js
console.log(chunk([1, 2, 3, 4, 5], 2));
// Output: [[1, 2], [3, 4], [5]]

console.log(chunk([10, 20, 30, 40], 3));
// Output: [[10, 20, 30], [40]]

console.log(chunk([], 3));
// Output: []
```  
How it works:
- In the first example, the array of 5 elements is broken into 2-element chunks: `[1,2]`, `[3,4]` and then the leftover `[5]`.
- In the second, 4 elements into chunks of 3 gives one chunk of 3 and one chunk of 1.
- If the array is empty or size is larger than array length, you simply get one chunk with remaining elements or an empty array result accordingly.
- If size is 1, it will just return an array of single-element arrays (essentially a copy of the array but each element isolated).

This implementation assumes `size` is a positive integer. If a non-integer or other is passed, it might result in unexpected behavior or we could choose to floor it. The lodash version floors non-integers and treats invalid sizes in a particular way.

<br/>

# 34. Implement Custom Deep Clone (Medium)  
A **deep clone** creates a new object that is a copy of the original object and all of its nested structures (arrays, objects, etc.), so that modifying the clone does not affect the original. 

**Solution:** Use recursion to copy each level of the object:
- If the value is a primitive (string, number, boolean, null, undefined) or a function (which is also an object but usually you copy reference), return it directly (primitives are immutable).
- If it’s an array, create a new array and deep clone each element.
- If it’s a plain object, create a new object and deep clone each property.
- Handle special object types: 
  - For Date, create a new Date with the same time.
  - For RegExp, create a new RegExp with the same pattern and flags.
- Optionally handle Map, Set by cloning their entries (depending on how fully featured we want it).
- Use a map to track already cloned objects to handle circular references (not shown in simple version).

Below is a basic implementation with handling for objects, arrays, Date, and RegExp, and protection against simple circular references using a WeakMap:

```js
function deepClone(value, seen = new WeakMap()) {
  // Handle primitives and functions (they are returned as is)
  if (value === null || typeof value !== 'object') {
    return value;
  }
  // Handle circular references
  if (seen.has(value)) {
    return seen.get(value);
  }

  // Handle Date
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  // Handle RegExp
  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags);
  }
  // Handle Array
  if (Array.isArray(value)) {
    const arrCopy = [];
    seen.set(value, arrCopy);
    for (let item of value) {
      arrCopy.push(deepClone(item, seen));
    }
    return arrCopy;
  }
  // Handle Object
  const objCopy = {};
  seen.set(value, objCopy);
  for (let key in value) {
    if (value.hasOwnProperty(key)) {
      objCopy[key] = deepClone(value[key], seen);
    }
  }
  return objCopy;
}
```

**Example Usage:**  
```js
const original = {
  name: "Alice",
  age: 30,
  scores: [10, 20, 30],
  nested: { foo: "bar" },
  created: new Date(),
  regex: /hello/g
};
original.self = original;  // introduce a circular reference for testing

const copy = deepClone(original);
console.log(copy);
console.log(copy.scores === original.scores);       // false (different array)
console.log(copy.nested === original.nested);       // false (different object)
console.log(copy.created.getTime() === original.created.getTime()); // true (same date value)
console.log(copy.regex.toString() === original.regex.toString());   // true (same regex pattern)
console.log(copy.self === copy);                    // true (circular reference preserved in clone)
```  
The output `copy` is a new object structurally equal to `original`:
- It has the same properties and values, including a deep copy of `scores` array and `nested` object.
- The `created` date in the copy is a different Date object but with the same timestamp.
- The regex is cloned as a new RegExp object with the same pattern and flags.
- The circular reference `self` was handled by the `seen` WeakMap to avoid infinite recursion, and in the clone `copy.self` points to `copy` itself, mirroring the original structure.

By using a `WeakMap` named `seen`, we store references to already cloned objects, and if we encounter them again, we reuse the reference. This is crucial for handling cyclic structures.

<br/>

# 35. Promisify the Async Callbacks (Easy)  
**Promisify** is converting a function that uses a callback (especially Node.js-style with `(err, result)` callback) into a function that returns a Promise. This allows using `async/await` or promise chaining instead of callback patterns.

**Solution:** Create a function `promisify(fn)` that returns a new function. When this new function is called, it will return a Promise. Inside that promise, call the original `fn`, and handle its callback:
- If the original calls back with an error (assuming Node convention where the first callback argument is an error), reject the promise.
- Otherwise, resolve the promise with the result.

Typically, Node callbacks are of the form `(err, data)`. We will assume that signature in our implementation for simplicity.

```js
function promisify(func) {
  return function (...args) {
    return new Promise((resolve, reject) => {
      // Push a custom callback to handle resolution
      function callback(err, result) {
        if (err) {
          return reject(err);
        }
        resolve(result);
      }
      // Call original function with provided args + our callback
      func.call(this, ...args, callback);
    });
  };
}
```

**Example Usage:**  
```js
// Original callback-style function (Node.js style: err-first callback)
function readData(id, callback) {
  setTimeout(() => {
    if (id === 42) callback(null, "Data for id 42");
    else callback(new Error("Not found"));
  }, 100);
}

// Create a promisified version
const readDataAsync = promisify(readData);

readDataAsync(42)
  .then(data => console.log("Success:", data))
  .catch(err => console.error("Error:", err.message));

readDataAsync(99)
  .then(data => console.log("Success:", data))
  .catch(err => console.error("Error:", err.message));
```  
Expected output:
```
Success: Data for id 42  
Error: Not found
```  
Explanation:
- When calling `readDataAsync(42)`, it returns a Promise. Inside, it calls `readData(42, callback)`. The simulated async returns "Data for id 42" with no error, so the promise resolves with that data.
- When calling `readDataAsync(99)`, the callback receives an Error ("Not found"), so the promise is rejected, and the catch logs the error message.

The `promisify` function we wrote can be used to convert many traditional callback-based functions into promise-based ones. This greatly simplifies asynchronous flow management, especially as it enables use of `await` syntax.

<br/>

# 36. Implement 'N' async tasks in Series (Hard)  
Running N async tasks in **series** means executing them one after the other, waiting for each to complete before starting the next. If any fails (depending on requirements), you might stop the chain or collect errors.

**Solution:** Suppose we have an array of functions (`tasks`), where each function returns a Promise or is an `async` function. We want to invoke them sequentially. We can simply use a loop with `await` (if using async/await) or use `reduce` to chain promises.

**Using async/await (simplest to read):**

```js
async function runTasksInSeries(tasks) {
  const results = [];
  for (const task of tasks) {
    // Await each task's completion before moving to next
    const result = await task();
    results.push(result);
  }
  return results;
}
```

If any task rejects, this `async` function will throw, and you might catch it outside.

**Using Promise chaining with reduce:**

```js
function runTasksInSeriesPromise(tasks) {
  const results = [];
  return tasks.reduce((prevPromise, task) => {
    return prevPromise.then(() => task().then(res => {
      results.push(res);
    }));
  }, Promise.resolve())
  .then(() => results);
}
```

This starts with an already-resolved promise and then chains each task onto it.

**Example Usage:**  
```js
const tasks = [
  () => Promise.resolve(1),
  () => new Promise(res => setTimeout(() => res(2), 100)),
  () => Promise.resolve(3)
];

runTasksInSeries(tasks)
  .then(results => console.log("Series results:", results));
```  
Output (after ~100ms for the delayed task):
```
Series results: [1, 2, 3]
```  
Explanation: The tasks array contains three functions that return promises (the second one simulates a small delay). `runTasksInSeries` will execute them one by one:
- It waits for the first task to resolve (immediately yields 1).
- Then calls the second task, waits ~100ms for it to resolve with 2.
- Then calls the third task, which resolves immediately with 3.
- Collects `[1,2,3]` as results.

If any task in the series rejects, the `runTasksInSeries` promise will reject at that point (and subsequent tasks won’t run). You might handle that by catching inside the loop if you want to continue despite errors.

**Note:** If the tasks are not promise-returning but use callbacks, you’d either wrap them to promises first (like using the promisify above) or adjust logic to call next in each callback.

<br/>

# 37. Implement 'N' async tasks in Parallel (Medium)  
Running tasks in **parallel** means starting all tasks at roughly the same time and letting them run concurrently (not waiting for one to finish before starting the next). In terms of promises, you can kick off all promises without awaiting them immediately, then await all of them together.

**Solution:** If `tasks` is an array of functions returning promises, simply map through and call each to get an array of promises, then use `Promise.all` to wait for all results. This will give you a single promise that resolves when all are done or rejects if any fail.

```js
function runTasksInParallel(tasks) {
  // Start all tasks simultaneously
  const promises = tasks.map(task => task());
  // Wait for all to settle
  return Promise.all(promises);
}
```

**Example Usage:**  
```js
const tasks = [
  () => new Promise(res => setTimeout(() => res(1), 300)),  // resolves after 300ms
  () => new Promise(res => setTimeout(() => res(2), 100)),  // resolves after 100ms
  () => Promise.resolve(3)                                 // resolves immediately
];

console.time("parallel");
runTasksInParallel(tasks).then(results => {
  console.timeEnd("parallel");
  console.log("Parallel results:", results);
});
```  
Expected output:
```
parallel: ~300ms
Parallel results: [1, 2, 3]
```  
All tasks were started in parallel:
- Task2 (100ms) and Task3 (immediate) finish earlier, but `Promise.all` waits till the longest one (Task1, ~300ms) finishes.
- The total time logged (~300ms) is roughly the duration of the slowest task, not the sum, indicating parallel execution.
- The results `[1, 2, 3]` correspond to each task’s output, in the same order as the tasks array.

If any of the tasks had rejected, `Promise.all` would reject with that error (the first error it encounters). If you want to handle partial successes, you could use `Promise.allSettled` or handle errors on individual promises.

<br/>

# 38. Implement 'N' async tasks in Race (Easy)  
Running tasks in **race** means you are interested only in the first task to settle (fulfill or reject) out of a set. This is effectively what `Promise.race` does.

**Solution:** If `tasks` is an array of promise-returning functions, call them all and use `Promise.race` to get a promise that resolves or rejects as soon as one of the tasks resolves or rejects.

```js
function runTasksInRace(tasks) {
  const promises = tasks.map(task => task());
  return Promise.race(promises);
}
```

**Example Usage:**  
```js
const tasks = [
  () => new Promise(res => setTimeout(() => res("First"), 500)),
  () => new Promise(res => setTimeout(() => res("Second"), 300)),
  () => new Promise(res => setTimeout(() => res("Third"), 100))
];

runTasksInRace(tasks).then(result => {
  console.log("Race winner:", result);
});
```  
Expected output (after ~100ms):
```
Race winner: Third
```  
Here, each task simply resolves after a delay: "First" after 500ms, "Second" after 300ms, "Third" after 100ms. The race will complete when the fastest one (the third task) finishes. We see "Third" as the winner, about 100ms in, and we don't wait for the others (though they may still complete in the background, their results are ignored).

If the first promise to settle had been a rejection, `runTasksInRace` would produce a rejected promise (and you would handle it with `.catch`). If you specifically wanted the first success and not consider rejections as ending the race, then you'd need a different approach (like Promise.any or filtering out rejections). But by default, race takes the first settled result, success or fail.

<br/>

# 39. Implement Custom Object.is() method (Easy)  
`Object.is(x, y)` determines if two values are the same value, similar to `===` but with special handling for `NaN` and signed zeros. Specifically:
- `Object.is(NaN, NaN)` is true (whereas `NaN === NaN` is false).
- `Object.is(0, -0)` is false (whereas `0 === -0` is true, because they’re considered equal by `===`).
- Otherwise, it’s basically the same as `===`.

**Solution:** Implement a function `is(x, y)` that checks for those special cases:
- If `x` and `y` are both 0 but have different signs, return false.
- If `x` and `y` are both NaN (we can check using `x !== x` because that is only true for NaN), return true.
- Otherwise, return `x === y`.

```js
function is(x, y) {
  if (x === y) {
    // This treats -0 === 0 as true, so need to distinguish them:
    // Check if either is 0 (which implies both are 0) and the signs differ.
    return x !== 0 || 1 / x === 1 / y;
    // Explanation: 1/0 === Infinity, 1/-0 === -Infinity. So if x and y are 0 but with different signs, 1/x !== 1/y.
  } else {
    // If x !== y in normal equality, it could be NaN case.
    // If both x and y are NaN, then x !== x and y !== y will both be true.
    return x !== x && y !== y;
  }
}
```

**Example Usage:**  
```js
console.log(is(5, 5));            // true
console.log(is(0, -0));           // false  (distinguishes signed zero)
console.log(is(NaN, NaN));        // true   (treats NaN as same)
console.log(is(5, '5'));          // false  (different types)
console.log(is(false, false));    // true
console.log(is({}, {}));          // false  (different object references)
```  
This `is` function behaves identically to `Object.is`:
- `is(0, -0)` gives false because 1/0 is Infinity and 1/-0 is -Infinity, so the special check returns false.
- `is(NaN, NaN)` gives true due to the `x !== x` logic.
- Other comparisons follow normal strict equality rules.

For most use cases, you rarely need `Object.is`, except when you specifically need to differentiate -0 or handle NaN equality, such as in polyfills or certain algorithms like SameValueZero, etc.

<br/>

# 40. Implement Custom lodash _.partial() (Medium)  
Lodash’s `_.partial(fn, ...partials)` creates a function that invokes `fn` with some arguments pre-filled. It’s similar to currying but not all arguments need to be provided, and you can call the resulting function with the remaining arguments later.

**Solution:** We can implement `partial` such that:
- It takes a function `fn` and some preset arguments.
- Returns a new function that, when called with additional arguments, calls `fn` with the preset ones first followed by these new ones.

Basic implementation (without placeholder support for gaps):

```js
function partial(fn, ...presetArgs) {
  return function (...laterArgs) {
    return fn(...presetArgs, ...laterArgs);
  };
}
```

This assumes preset arguments go first. If you want placeholders (like lodash allows using `_` to skip some preset position), that complicates it. But since placeholder support was a separate question (currying with placeholders), we’ll assume partial here is simpler left-to-right binding.

**Example Usage:**  
```js
function greet(greeting, title, name) {
  return `${greeting}, ${title} ${name}!`;
}
const sayHelloTo = partial(greet, "Hello", "Dr.");
console.log(sayHelloTo("Jones"));   // "Hello, Dr. Jones!"

const add = (a, b, c) => a + b + c;
const add5 = partial(add, 5);
console.log(add5(10, 2));  // 17  (5 + 10 + 2)
```  
In `sayHelloTo = partial(greet, "Hello", "Dr.")`, we've fixed the first two arguments of `greet` to `"Hello"` and `"Dr."`. The returned function only needs the `name` to produce a full greeting.

For `add5`, we fixed the first argument of `add` to 5, so calling `add5(x, y)` will compute `5 + x + y`.

This implementation is straightforward and covers common use: prefixing some arguments. If we needed more sophisticated partial application (like skipping some arguments), we could incorporate placeholder logic similar to currying with placeholders, but the question likely expects the basic behavior.

<br/>

# 41. Implement Custom lodash _.once() (Medium)  
Lodash’s `_.once(func)` creates a function that **invokes `func` at most once**. Subsequent calls return the result of the first invocation. This is useful for initialization functions that should run a single time.

**Solution:** We can wrap the function in a closure that tracks whether it has been called. Use a flag `called` and a variable `result` to store the result of the first call. On subsequent calls, skip executing the original function and just return the stored result.

```js
function once(fn) {
  let called = false;
  let result;
  return function(...args) {
    if (!called) {
      called = true;
      result = fn.apply(this, args);
    }
    return result;
  };
}
```

**Example Usage:**  
```js
let count = 0;
function increment() {
  return ++count;
}
const incrementOnce = once(increment);

console.log(incrementOnce());  // 1  (function runs, count becomes 1)
console.log(incrementOnce());  // 1  (function does not run again, returns stored result)
console.log(incrementOnce());  // 1  (same as above)
console.log(count);            // 1  (confirm original function ran only once)
```  

Another example:  
```js
const init = once(() => { console.log("Initializing..."); });
// Even if called multiple times, "Initializing..." will print only once
init();
init();
```  
Output: (only one line)  
```
Initializing...
```  

The `once` function ensures `fn` is only executed on the first call. The result of that call is cached and returned for all future calls. It also preserves the `this` context (`.apply(this, args)`) and passes through arguments appropriately for that first invocation.

<br/>

# 42. Implement Custom trim() operation (Medium)  
The `String.prototype.trim()` method removes whitespace from both the beginning and end of a string. We can implement this manually.

**Solution:** One straightforward method is to find the index of the first non-whitespace character and the index of the last non-whitespace character, then take a substring between them.
- Define what is considered whitespace: typically spaces, tabs (`\t`), newlines (`\n`), etc. We can use a regex or character checks (anything that `\s` would match in regex).
- Start from the front of the string and move forward until a non-whitespace is found.
- Start from the end of the string and move backward until a non-whitespace is found.
- Extract the substring in between.

```js
function trim(str) {
  let start = 0;
  let end = str.length - 1;
  // Move start forward while char is whitespace
  while (start <= end && /\s/.test(str[start])) {
    start++;
  }
  // Move end backward while char is whitespace
  while (end >= start && /\s/.test(str[end])) {
    end--;
  }
  // Now str[start] and str[end] are first and last non-whitespace (or start > end if string is all whitespace)
  return str.substring(start, end + 1);
}
```

**Example Usage:**  
```js
console.log(trim("   Hello World  "));    // "Hello World"
console.log(trim("\n\tHello\t\n"));      // "Hello"  (trims newline and tab around)
console.log(trim("NoTrim"));            // "NoTrim" (no leading/trailing whitespace)
console.log(trim("    "));              // "" (only spaces becomes empty string)
```  
This `trim` handles spaces, tabs, and newlines via `\s` in the regex. It does not remove internal whitespace, only leading and trailing. The result matches what the native `trim` would do for these examples:
- `"   Hello World  "` becomes `"Hello World"`.
- Newlines and tabs around `"Hello"` are removed.
- A string of only spaces becomes an empty string.

One could also implement without regex by explicitly checking char codes (like 32 for space, 9 for tab, 10 for newline etc.), but using `\s` is concise.

This approach runs in O(n) time where n is string length, scanning at most twice through the string (once from front, once from back).

<br/>

# 43. Implement Custom reduce() method (Medium)  
We’ll polyfill `Array.prototype.reduce`, which applies a reducer function over an array to accumulate a single result. The signature is `arr.reduce(callback, [initialValue])` where:
- `callback(accumulator, currentValue, index, array)` is applied for each element.
- `initialValue` is optional; if omitted, the first array element is used as the initial accumulator (and iteration starts from second element).

**Solution:** Add a method `myReduce` to Array’s prototype (or implement as a standalone that takes the array). Handle the initial value logic:
- If no initial value provided, ensure the array isn’t empty (or throw TypeError as the spec does).
- Start `accumulator` as initial value or `array[0]`.
- Loop from index 0 or 1 depending on initial.
- For each index, skip if it’s a sparse hole (to mimic native reduce which skips unset indices in sparse arrays).
- Call the callback with (accumulator, currentValue, index, array) and assign the result to accumulator.
- Return accumulator.

```js
Array.prototype.myReduce = function(callback, initialValue) {
  if (typeof callback !== 'function') {
    throw new TypeError(callback + ' is not a function');
  }
  const array = this;
  let accumulator;
  let startIndex;
  if (initialValue !== undefined) {
    accumulator = initialValue;
    startIndex = 0;
  } else {
    if (array.length === 0) {
      throw new TypeError('Reduce of empty array with no initial value');
    }
    // Find first defined index if array has holes
    startIndex = 0;
    while (startIndex < array.length && !(startIndex in array)) {
      startIndex++;
    }
    if (startIndex >= array.length) {
      throw new TypeError('Reduce of empty array with no initial value');
    }
    accumulator = array[startIndex++];
  }

  for (let i = startIndex; i < array.length; i++) {
    if (i in array) {  // skip sparse array holes
      accumulator = callback(accumulator, array[i], i, array);
    }
  }
  return accumulator;
};
```

**Example Usage:**  
```js
const arr = [1, 2, 3, 4];
const sum = arr.myReduce((acc, num) => acc + num, 0);
console.log(sum);  // 10

const product = arr.myReduce((acc, num) => acc * num);
console.log(product);  // 24 (no initial value, so starts at 1 * 2 * 3 * 4)

const sparseArr = [,,5,5];  // sparse array with first two elements empty
const total = sparseArr.myReduce((acc, num) => acc + num);
console.log(total); // 10 (it skips the uninitialized empty slots)
```  
Explanation:
- Sum: starting accumulator at 0, adds all elements -> 10.
- Product: no initial given, so starts with arr[0] (1) and multiplies through -> 24.
- In the sparse array `[,,5,5]`, index 0 and 1 are holes (not defined). According to spec, if no initial value, the first defined element (at index 2, value 5) becomes accumulator, and iteration starts at index 3. So the result is 5 (acc) combined with arr[3] (5) = 10.

Our implementation accounts for holes by using the `in` operator to check if the index exists. It also properly errors out if you call reduce on an empty array without initial value. These behaviors match the official `Array.prototype.reduce`.

<br/>

# 44. Implement Custom lodash _.memoize() (Medium)  
`_.memoize(func)` creates a function that caches the result of `func` calls based on the arguments provided. If you call the memoized function again with the same arguments, it returns the cached result instead of recomputing.

**Solution:** Use a cache (e.g., an object or Map) to store results. The key can be derived from the arguments. For simplicity, we can use JSON stringification of arguments as the key (works for JSON-serializable arguments). A more robust approach might allow a custom resolver function or handle non-serializable arguments by using maps with key references, but basic usage often just stringifies.

```js
function memoize(fn) {
  const cache = new Map();
  return function(...args) {
    // Create a key from args. If only one arg and it's primitive or object, that itself could be key. 
    // For simplicity, use JSON string of args as key.
    let key = args.length === 1 ? args[0] : JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}
```

Optionally, we might accept a custom `resolver` function as in lodash to compute the cache key, but not necessary here.

**Example Usage:**  
```js
// Example: memoize a Fibonacci function to improve performance
function fib(n) {
  if (n < 2) return n;
  return fib(n - 1) + fib(n - 2);
}
const memoFib = memoize(fib);

console.log(memoFib(35));  // First call computes fib(35) with heavy recursion.
console.log(memoFib(35));  // Second call returns almost immediately from cache.

const add = (a, b) => {
  console.log("Computing", a, "+", b);
  return a + b;
};
const memoAdd = memoize(add);
console.log(memoAdd(2, 3));  // Logs "Computing 2 + 3", result 5
console.log(memoAdd(2, 3));  // No log this time, returns cached 5
```  
For `memoFib(35)`, the first call will take noticeable time (computing fibonacci recursively), but the second call retrieves the cached result instantly. If you call `memoFib(36)` afterward, it will compute partially but even that benefits because `memoFib(35)` is cached (assuming the implementation caches intermediate values as well; our simple wrapper only caches final calls, not intermediate, unless fib calls itself through the memoized version, which it doesn’t in this standalone snippet).

The `memoAdd` example shows caching with two arguments. The first call prints the computing message and returns 5. The second call with the same args doesn’t print (meaning it didn’t re-run `add` function) and directly returns the cached 5.

Note: Our key generation using JSON may not work for functions or special values as arguments and treats objects by their JSON representation (so `{a:1}` and `{a:1}` as different references produce the same key because JSON string is the same – which might be okay or not depending on desired behavior). Lodash’s memoize allows customizing this if needed.

<br/>

# 45. Implement Custom memoizeLast() method (Medium)  
`memoizeLast` (also sometimes known as `memoizeOne`) is an optimization that **only remembers the last result** of a function given its arguments. If the next call has identical arguments (using shallow or deep comparison), it returns the cached result; otherwise, it recomputes and updates the cache. This is useful for expensive computations where inputs don't often change from the previous call, and you don't want an unbounded cache growth as with general memoize.

**Solution:** Keep track of the last arguments and last result. On each call, compare the new arguments with the last ones (using a shallow comparison or deep if needed). If they match, return the cached result. If not, call the original function and update the stored args and result.

```js
function memoizeLast(fn) {
  let lastArgs = null;
  let lastResult;
  return function(...args) {
    if (lastArgs && args.length === lastArgs.length && args.every((arg, index) => arg === lastArgs[index])) {
      // Arguments are shallowly equal to lastArgs
      return lastResult;
    }
    // Compute new result and update cache
    lastResult = fn.apply(this, args);
    lastArgs = args;
    return lastResult;
  };
}
```

This uses strict equality for each argument to decide if the args are the same as last time. If the function takes objects and you want to detect deep equality changes, you’d need to adjust accordingly, but often this is used when arguments are primitives or stable references.

**Example Usage:**  
```js
let computeCount = 0;
function heavyCompute(x, y) {
  computeCount++;
  return x * y + Math.sqrt(x + y);
}
const memoHeavy = memoizeLast(heavyCompute);

console.log(memoHeavy(5, 10));  // computes result, computeCount = 1
console.log(memoHeavy(5, 10));  // returns cached result, computeCount still = 1
console.log(memoHeavy(5, 11));  // new args, computeCount = 2 (recomputed)
console.log(memoHeavy(5, 11));  // cached, computeCount still = 2
console.log("Function was actually called", computeCount, "times.");
```  
Here, `heavyCompute` is called only when arguments change:
- First call with (5,10) triggers computation (computeCount increments).
- Second call with (5,10) returns cache; computeCount stays same.
- Third call with (5,11) different from last args, so recompute (computeCount increments).
- Fourth call with (5,11) hits cache again.

Output might look like:
```
Result1
Result1
Result2
Result2
Function was actually called 2 times.
```  
(where Result1 and Result2 are the numeric outputs of heavyCompute).

This shows efficiency: even though `memoHeavy` was called 4 times, the heavy computation actually ran only 2 times. This technique is especially useful in React components or selectors where inputs often remain the same between calls, so you avoid unnecessary recalculation.

<br/>

# 46. Implement Custom call() method (Medium)  
`Function.prototype.call(thisArg, ...args)` invokes a function with a given `this` context and arguments. We can implement a custom version, say `myCall`, which should behave like `call`.

**Solution:** To call a function with a specific `this`, one trick is to assign the function as a temporary property of the `thisArg` object, invoke it, and then remove the property. This ensures the function’s `this` is the object. Also handle if `thisArg` is `null`/`undefined` (default to global object, which in browser is `window`, or use `globalThis` for a general approach).

```js
Function.prototype.myCall = function(context, ...args) {
  const func = this;
  if (context == null) {
    context = (typeof globalThis !== 'undefined') ? globalThis : window;
  }
  const uniqueSym = Symbol('fn');  // ensure a unique property key
  context[uniqueSym] = func;
  try {
    // Invoke function as method of context
    return context[uniqueSym](...args);
  } finally {
    // Clean up
    delete context[uniqueSym];
  }
};
```

We use a `Symbol` to avoid clashing with existing properties. We wrap the call in a `try/finally` to ensure the property gets deleted even if the function throws an error.

**Example Usage:**  
```js
function greet(msg) {
  return msg + ", " + this.name;
}
const person = { name: "Alice" };
const another = { name: "Bob" };

console.log(greet.myCall(person, "Hello"));    // "Hello, Alice"
console.log(greet.myCall(another, "Hi"));      // "Hi, Bob"

// Calling with null/undefined context defaults to global (or undefined in strict mode)
globalThis.name = "Zoe";
console.log(greet.myCall(null, "Hey"));        // "Hey, Zoe"  (using globalThis as default context)
```  
The custom `myCall` works analogously to the native `call`:
- We get correct binding: `greet.myCall(person, "Hello")` uses `person` as `this` inside greet.
- We can pass different objects, and it returns expected strings.
- When passing `null` or `undefined`, it falls back to `globalThis` (in Node or modern env this is the global object; in non-strict mode functions would default to global anyway).
- The original function is not permanently attached to the object (we remove it after calling).

Our implementation does not explicitly set context to an Object if it’s a primitive (like if `context` is a string or number, in non-strict mode, `call` would box these into String or Number objects). We could enhance it by doing `context = Object(context)` for non-null primitives to mimic that behavior. But for simplicity, main usage is covered.

<br/>

# 47. Implement Custom apply() method (Medium)  
`Function.prototype.apply(thisArg, argsArray)` is similar to `call`, but it takes an array-like object of arguments instead of listing them. We can implement `myApply` using a similar approach to `myCall`.

**Solution:** Check if second argument is provided and is an array (or array-like). Then invoke the function with that array spread out. We can reuse the technique of temporarily assigning the function as a property of the context.

```js
Function.prototype.myApply = function(context, argsArray) {
  const func = this;
  if (context == null) {
    context = (typeof globalThis !== 'undefined') ? globalThis : window;
  }
  const uniqueSym = Symbol('fn');
  context[uniqueSym] = func;
  let result;
  try {
    if (!argsArray) {
      result = context[uniqueSym]();
    } else if (typeof argsArray !== 'object' || !('length' in argsArray)) {
      throw new TypeError("Second argument to apply must be an array or array-like object");
    } else {
      result = context[uniqueSym](...argsArray);
    }
  } finally {
    delete context[uniqueSym];
  }
  return result;
};
```

We also include a type-check: if `argsArray` is not provided, we call without arguments. If it’s not array-like, throw a TypeError (the real `apply` expects an array or arguments object).

**Example Usage:**  
```js
function introduce(greeting, ending) {
  return `${greeting}, I'm ${this.name}${ending}`;
}
const person = { name: "Charlie" };

console.log(introduce.myApply(person, ["Hi", "!"]));   
// Output: "Hi, I'm Charlie!"

console.log(introduce.myApply(person, ["Hello", "..."])); 
// Output: "Hello, I'm Charlie..."

console.log(introduce.myApply(null, ["Hey", "!"])); 
// If globalThis.name = "GlobalName", might output "Hey, I'm GlobalName!"
```

This is analogous to using `introduce.apply(person, ["Hi", "!"])`. Our `myApply` properly spreads the array as arguments to the function.

Testing the TypeError:
```js
try {
  introduce.myApply(person, "wrong arg");
} catch(e) {
  console.error(e.message);  // "Second argument to apply must be an array or array-like object"
}
```  
Thus, our `myApply` closely mirrors the native behavior:
- It binds `this` to the provided context.
- It uses an arguments array correctly for invocation.
- It handles missing args or invalid args appropriately.

<br/>

# 48. Implement Custom bind() method (Medium)  
`Function.prototype.bind(thisArg, ...args)` returns a new function that, when called, has its `this` set to the provided context, and with optional initial arguments preset. It also needs to work with the `new` operator correctly (if a bound function is used as a constructor, the original function’s `this` should be the new instance, not the bound context, and the bound context is ignored).

**Solution:** To implement `bind`, we create a closure capturing:
- The target function `fn`.
- The bound `thisArg`.
- Any preset arguments (`presetArgs`).

We return a new function that when invoked:
- If called as a constructor (`this instanceof boundFn` is true), we should ignore the provided `thisArg` and instead use the new object (i.e., let the original function behave as constructor).
- Otherwise, call `fn` with `thisArg` and combined arguments.

Also, we set the prototype of the bound function to point to the original function’s prototype, so that `boundFn instanceof OriginalFunction` works, and to allow new operator to work properly (though official bind also sets an internal `[[BoundTargetFunction]]` etc., but for our case, setting prototype helps with inheritance).

```js
Function.prototype.myBind = function(context, ...presetArgs) {
  const func = this;
  return function boundFunction(...laterArgs) {
    // If called as a constructor (new boundFunction), `this` is the new instance
    const isNew = this instanceof boundFunction;
    const thisArg = isNew ? this : context;
    // Call the original function with either the new instance (when constructing)
    // or provided context (if normal call), with all arguments
    return func.apply(thisArg, [...presetArgs, ...laterArgs]);
  };
};
```

To ensure proper prototype:
```js
Function.prototype.myBind = function(context, ...presetArgs) {
  const func = this;
  function boundFunction(...laterArgs) {
    const isNew = this instanceof boundFunction;
    const thisArg = isNew ? this : context;
    return func.apply(thisArg, [...presetArgs, ...laterArgs]);
  }
  // Link boundFunction's prototype to func's prototype, so that 
  // new boundFunction(...args) has access to func.prototype properties
  boundFunction.prototype = Object.create(func.prototype);
  return boundFunction;
};
```

**Example Usage:**  
```js
function Person(first, last) {
  this.first = first;
  this.last = last;
}
Person.prototype.getFullName = function() {
  return this.first + " " + this.last;
};

const john = new Person("John", "Doe");
console.log(john.getFullName()); // "John Doe"

// Binding as constructor:
const PersonWithPresetLast = Person.myBind(null, /* context irrelevant when using new */ "Jane");
const jane = new PersonWithPresetLast("Smith");
console.log(jane.getFullName()); // "Jane Smith"  (first name preset to "Jane", last provided as "Smith")

// Binding with context and normal call:
const module = {
  x: 42,
  getX() { return this.x; }
};
const getX = module.getX.myBind({ x: 100 });
console.log(getX()); // 100  (bound to context with x:100)
```  

Explanation:
- We preset "Jane" as the first name in a bound constructor. When we do `new PersonWithPresetLast("Smith")`, the bound function recognizes it’s called with `new`, so it uses the newly created `this` rather than the `null` context. The original Person constructor is called with `this.first = "Jane"` (bound arg) and `"Smith"` as last name. The prototype linkage ensures `jane instanceof Person` is true and methods work.
- For normal binding, `getX = module.getX.myBind({x:100})` creates a function that will always use the provided object as `this`. So calling `getX()` returns 100 regardless of how it’s called.

Our `myBind` supports partial application of arguments and constructor usage, which covers key aspects of the real `bind`. 

*(One caveat: The real bound function has a `length` property reflecting the remaining expected arguments and some special `.name` behavior, which we haven't implemented, but those are minor details out of scope for an interview implementation.)*

<br/>

# 49. Implement Custom React "classnames" library (Medium)  
The `classnames` utility (often used in React) is a popular function for conditionally joining CSS class names. It allows arguments of different types:
- Strings (which are class names).
- Objects (where key is class name and value is truthy/falsy to include it).
- Arrays (which can contain strings or further nested arrays/objects).
- And it ignores falsy values like `false`, `null`, `undefined`.

**Solution:** We create a function `classNames` (often imported as `cx` or `classnames`) that accepts any number of arguments. We iterate through each argument and build a result string:
- If the argument is a string or number (number allowed because classnames lib allows numbers as keys sometimes), include it.
- If it’s an array, recursively process its elements.
- If it’s an object, include the key if and only if the value is truthy.
- Ignore `false`, `null`, `undefined`, `0` (assuming 0 should be treated as falsy and not included as class name), and `""` (empty string).

```js
function classNames(...args) {
  let classes = [];
  for (const arg of args) {
    if (!arg) continue;  // skip falsy values (false, null, undefined, 0, "")

    const argType = typeof arg;
    if (argType === 'string' || argType === 'number') {
      classes.push(arg);
    } else if (Array.isArray(arg)) {
      // Recursively handle arrays
      classes.push(classNames(...arg));
    } else if (argType === 'object') {
      for (const key in arg) {
        if (arg.hasOwnProperty(key) && arg[key]) {
          classes.push(key);
        }
      }
    }
  }
  // Filter out any empty strings that might have been added and join with space
  return classes.filter(Boolean).join(' ');
}
```

**Example Usage:**  
```js
console.log(classNames("btn", "btn-primary"));  
// "btn btn-primary"

console.log(classNames("btn", { "btn-disabled": false, "active": true }, null, undefined));  
// "btn active"  ("btn-disabled" is omitted because its value is false, null/undefined are ignored)

console.log(classNames(["header", ["bold", { italic: false }], "underline"]));  
// "header bold underline"  (nested array processed, "italic" omitted)

console.log(classNames({ modal: true }, "open", ["bg-dark", { hidden: 0, visible: 1 }]));  
// "modal open bg-dark visible"
// Explanation: 'hidden' omitted (0 is falsy), 'visible' included (1 is truthy)
```  

This matches common usage:
- You can pass a string for a single class.
- You can pass an object to toggle classes on/off.
- You can nest arrays or even objects within arrays arbitrarily; `classNames` will flatten them appropriately.
- Falsy values are not included in the output.

The resulting string has class names separated by a single space, and it will be empty (`""`) if no class names were provided/truthy.

<br/>

# 50. Implement Custom Redux used "Immer" library (Medium)  
Immer is a library that allows you to work with immutable state by using a proxy-wrapped draft state that you can mutate. After the mutation, it produces a new immutable state. Re-implementing Immer fully is complex, but we can simulate a basic idea:
- Provide a `produce(baseState, producerFunction)` that gives a draft (a proxy of baseState) to the producerFunction to mutate, then returns a new state reflecting those changes without modifying the original.

**Solution:** Use `Proxy` to intercept property accesses and changes. When `produce` is called:
- We create a shallow clone of `baseState` (for safety).
- Create proxies for objects/arrays that record modifications (or directly apply them to the clone).
- After running the producer function with the proxy, return the modified clone (which is the next state).

A simplified approach:
- Only handle plain objects and arrays.
- The proxy’s `set` trap will mark something as modified.

```js
function produce(baseState, producer) {
  // If baseState is not an object (number, string, etc.), just let producer return something
  if (typeof baseState !== 'object' || baseState === null) {
    return producer(baseState);
  }

  let copy;  // will hold the mutable draft copy
  const modified = new WeakSet();  // track which objects have been modified

  const handler = {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      // If value is object, wrap it in proxy as well (deep proxy)
      if (typeof value === 'object' && value !== null) {
        return new Proxy(value, handler);
      }
      return value;
    },
    set(target, prop, value) {
      if (!copy) {
        // On first write, make a shallow clone of baseState
        copy = Array.isArray(target) ? target.slice() : { ...target };
      }
      modified.add(copy);
      copy[prop] = value;
      return true;
    }
  };

  const proxy = new Proxy(baseState, handler);
  // Run the producer function with the proxy
  const returnValue = producer(proxy);

  // If producer explicitly returned something (non-undefined), use that as next state
  if (returnValue !== undefined && returnValue !== proxy) {
    return returnValue;
  }
  // If nothing was modified, return baseState (no change)
  if (!copy) {
    return baseState;
  }
  // Otherwise, return the modified clone (and recursively finalize proxies inside, if any)
  return copy;
}
```

This is a rudimentary version:
- It shallow clones on first modification to avoid modifying the original (copy-on-write).
- If no changes happened, it returns original state (to avoid unnecessary new object).
- It doesn’t handle deep nested structural sharing aside from what proxy naturally handles.

**Example Usage:**  
```js
const state = { user: { name: "Ann", age: 30 }, loggedIn: false };
const nextState = produce(state, draft => {
  draft.user.age = 31;
  draft.loggedIn = true;
});
// nextState is a new object, state remains unchanged
console.log(state);      
// { user: { name: "Ann", age: 30 }, loggedIn: false }
console.log(nextState);  
// { user: { name: "Ann", age: 31 }, loggedIn: true }
console.log(state.user === nextState.user); 
// false (inner object was cloned because it was modified)
```  

We see that `nextState` has the updates, and `state` is unchanged. The proxy allowed us to write `draft.user.age = 31` as if mutable. Under the hood, it cloned `user` object when we first wrote to it. The final `nextState` shares unchanged parts with `state` (in our simple approach, it shares everything except what we wrote, though our shallow clone logic clones only the root or array where the write happened — a complete Immer would do structural sharing more intelligently).

Another operation:
```js
const arrayState = [1, 2, 3];
const nextArray = produce(arrayState, draft => {
  draft.push(4);
});
console.log(arrayState);   // [1,2,3]
console.log(nextArray);    // [1,2,3,4]
```  
We can push onto `draft` as if it’s a normal array. The trap makes a copy and performs the push on it.

This imitates the core idea of Immer: working with a draft and resulting in an immutably updated state. A real Immer implementation is more complex (handles nested modifications, map/set, etc.), but this gives a conceptual reimplementation.

<br/>

# 51. Implement Custom Virtual DOM - I (Serialize) - Hard  
A **Virtual DOM** representation is an object-based description of a UI (DOM tree). "Serialize" here likely means converting a real DOM (or a virtual structure) into a pure JavaScript object format (the virtual DOM tree).

**Solution:** We can traverse a DOM Node tree and create a lightweight representation:
- Represent element nodes with an object `{ type: 'tagName', props: { ...attributes }, children: [ ... ] }`.
- Represent text nodes as strings (or as `{ type: "#text", value: text }`).
- Optionally ignore comment nodes or other node types or include them if needed.

For simplicity, define:
```js
function serializeDOM(node) {
  // Text node
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  // Element node
  if (node.nodeType === Node.ELEMENT_NODE) {
    const tag = node.tagName;
    // get attributes
    const props = {};
    for (const attr of node.attributes) {
      props[attr.name] = attr.value;
    }
    // serialize children
    const children = [];
    node.childNodes.forEach(child => {
      const serializedChild = serializeDOM(child);
      // skip empty text nodes (optional)
      if (serializedChild !== "") {
        children.push(serializedChild);
      }
    });
    return { type: tag, props, children };
  }
  // For other node types (comments, etc.), we can choose to skip or handle if needed.
  return null;
}
```

Using `Node.TEXT_NODE` and `Node.ELEMENT_NODE` constants to detect node types.

**Example Usage:**  
Suppose our HTML DOM is:
```html
<div id="app">
  Hello <span class="name">World</span>!
</div>
```
If we target the `<div id="app">` element:
```js
const appDiv = document.getElementById('app');
const vdom = serializeDOM(appDiv);
console.log(JSON.stringify(vdom, null, 2));
```
Output (formatted):
```json
{
  "type": "DIV",
  "props": { "id": "app" },
  "children": [
    "Hello ",
    {
      "type": "SPAN",
      "props": { "class": "name" },
      "children": [ "World" ]
    },
    "!"
  ]
}
```  
This object is the serialized virtual DOM. Notice:
- The `DIV` has children: a text "Hello ", a nested `SPAN` object, and another text "!".
- Attributes like id and class are captured in `props`.
- Text is just represented as strings in this simple model.
  
This virtual DOM can be used for diffing or reconstructing the UI later. We have effectively captured the structure and content of the real DOM in a JSON-friendly format. 

Our serialization skipped empty text nodes (common to filter out whitespace-only text nodes); we included them conditionally.

<br/>

# 52. Implement Custom Virtual DOM - II (Deserialize) - Medium  
This is the inverse of the above: take a virtual DOM representation (like the object we created) and **create actual DOM nodes** from it. Essentially, a function that takes the VDOM object and returns a real DOM Element/Node tree.

**Solution:** Traverse the virtual DOM structure:
- If the current node is a string, create a text node with that string.
- If it’s an object (with `type` property):
  - Create an element using `document.createElement(type)`.
  - Set its attributes from `props`.
  - Recursively append children by calling the function on each child in `children`.
- Return the created DOM node.

```js
function deserializeVDOM(vnode) {
  // If vnode is a string, create a text node
  if (typeof vnode === "string") {
    return document.createTextNode(vnode);
  }
  // If vnode is an object representing an element
  const element = document.createElement(vnode.type);
  // Set properties/attributes
  for (const [attr, value] of Object.entries(vnode.props || {})) {
    element.setAttribute(attr, value);
  }
  // Append children
  (vnode.children || []).forEach(childVDOM => {
    const childNode = deserializeVDOM(childVDOM);
    element.appendChild(childNode);
  });
  return element;
}
```

**Example Usage:**  
Using the virtual DOM object from the previous example:
```js
const vdom = {
  type: "DIV",
  props: { id: "app" },
  children: [
    "Hello ",
    { type: "SPAN", props: { class: "name" }, children: ["World"] },
    "!"
  ]
};
const domNode = deserializeVDOM(vdom);
console.log(domNode.outerHTML);
// Expected: <div id="app">Hello <span class="name">World</span>!</div>
```
If we then attach `domNode` to the document (e.g., `document.body.appendChild(domNode)`), we would see the Hello World content just as in the original.

Our `deserializeVDOM` correctly:
- Created a `<div id="app">`.
- Created a text node "Hello " and appended.
- Created a `<span class="name">` with text "World" inside, appended that.
- Appended "!" text node.
- The resulting DOM tree matches the serialized description.

This is effectively how a library might create DOM from a virtual representation (like React creating actual DOM from its virtual DOM on initial render).

Note: In a more complex scenario, one might handle event listeners or special props differently (e.g., `props.onclick` might be a function to assign to `element.onclick`). Our example only handles attributes.

<br/>

# 53. Implement Memoize/Cache identical API calls  
This refers to caching the results of identical API calls to avoid duplicate network requests for the same data. If multiple parts of an app request the same resource, the first call should fetch from the network and subsequent calls (with the same parameters) return the cached promise or result.

**Solution:** We can implement a function `cachedFetch` (or a generic `memoizePromise`) that takes an identifying key (like a URL or a serialized request) and returns a promise. Under the hood, maintain a cache (mapping keys to ongoing promises or resolved results). If a request for a key is already in flight, return the same promise. If resolved, maybe return a resolved value or keep it stored for a certain time.

For simplicity, assume key is the request URL and we use `fetch`:
```js
const apiCache = new Map();

function cachedFetch(url, options) {
  const key = url + JSON.stringify(options || {});
  if (apiCache.has(key)) {
    return apiCache.get(key);
  }
  const promise = fetch(url, options)
    .then(response => response.json())
    .then(data => {
      apiCache.set(key, Promise.resolve(data)); // store resolved data as Promise for future calls
      return data;
    })
    .catch(error => {
      apiCache.delete(key); // remove from cache on error so it can be tried again
      throw error;
    });
  apiCache.set(key, promise);
  return promise;
}
```

Explanation:
- We check if `apiCache` has the key. If yes, return the cached promise (or data). We store promises to handle sharing one in-flight request.
- If not, we create a promise by calling `fetch`. When it resolves, we update the cache entry to a resolved state (Optionally, you could keep it as the same promise; storing `Promise.resolve(data)` ensures the cached value is always a settled promise with the actual data).
- On rejection, remove the key from cache to avoid keeping a failed promise (so that a subsequent call can retry).
- This example assumes `response.json()` usage; adapt if needed for non-JSON.

**Example Usage:**  
```js
// First call - will actually fetch
cachedFetch('/api/user/123').then(data => {
  console.log("Got user 123:", data);
});

// Suppose somewhere else in the app, before the first call finishes:
cachedFetch('/api/user/123').then(data => {
  console.log("Got user 123 again:", data);
});
// The second call will not trigger a second network request; it will get the same promise as the first call.

setTimeout(() => {
  // After first call has resolved, calling again returns cached resolved data instantly (assuming still in cache):
  cachedFetch('/api/user/123').then(data => console.log("Cached user 123:", data));
}, 1000);
```  

As a result:
- Only one network request to `/api/user/123` happens, even though `cachedFetch` was called twice immediately.
- Both `.then` callbacks will receive the data when it's ready.
- Subsequent calls (within a reasonable time) return the data from `apiCache` without a new request.

One might consider cache invalidation strategies (like timeout or manual clear) depending on use case, but for interview scope, demonstrating capturing identical calls and returning cached results suffices.
